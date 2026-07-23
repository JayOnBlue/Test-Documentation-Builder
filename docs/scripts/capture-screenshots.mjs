#!/usr/bin/env node
// =============================================================================
// capture-screenshots.mjs — secretless, Playwright-based screenshot capture
// =============================================================================
//
// A drop-in alternative to the robot-capture/ (Robot Framework) suite. It reads
// the SAME docs/screenshot-manifest.json and writes the SAME docs/images/<id>.png
// files the doc site expects — so build-site.js does not care which capturer ran.
//
// Auth model (see .github/workflows/sf-screenshots.yml): this script never sees
// the raw access token. The workflow logs the `sf` CLI in first; here we ask that
// already-authenticated CLI for a ONE-TIME frontdoor login URL, navigate to it
// exactly once, and then drive the Lightning SPA in-page. The frontdoor URL is
// token-bearing, so it is NEVER logged — only the org origin is.
//
// All CLI calls use execFileSync with an argv array (never a concatenated shell
// string), closing off command-injection vectors.
// =============================================================================

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// ----------------------------------------------------------------------------
// Configuration (all overridable via env; see the workflow `env:` blocks)
// ----------------------------------------------------------------------------
const ORG_ALIAS = process.env.SF_ORG_ALIAS || "screenshotOrg";
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || "docs/images";
const MANIFEST_PATH =
  process.env.SCREENSHOT_MANIFEST || "docs/screenshot-manifest.json";
const RECAPTURE = /^(1|true|yes)$/i.test(process.env.RECAPTURE || "");
const VIEWPORT = { width: 1600, height: 900 };
const DEFAULT_TIMEOUT = 90_000;
const SF = process.platform === "win32" ? "sf.cmd" : "sf";

// ----------------------------------------------------------------------------
// sf CLI bridge (argv arrays only — no shell string interpolation)
// ----------------------------------------------------------------------------

/** Run an `sf` command and return parsed JSON `.result`. */
function sfJson(args) {
  const out = execFileSync(SF, [...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out).result;
}

/** Get a one-time frontdoor login URL for the org (token-bearing — do not log). */
function getFrontdoorUrl() {
  const result = sfJson(["org", "open", "--target-org", ORG_ALIAS, "--url-only"]);
  const url = result?.url;
  if (!url) throw new Error("sf org open did not return a login URL");
  return url;
}

/** Return the Id of the most recent record of an object via SOQL, or null. */
export function firstRecordId(objectApiName) {
  const soql = `SELECT Id FROM ${objectApiName} ORDER BY CreatedDate DESC LIMIT 1`;
  const result = sfJson(["data", "query", "--target-org", ORG_ALIAS, "--query", soql]);
  return result?.records?.[0]?.Id || null;
}

// ----------------------------------------------------------------------------
// Manifest helpers (mirror robot-capture/…/DocsCapture.py semantics)
// ----------------------------------------------------------------------------

/** Pull the object API name out of a /lightning/r/<Object>/{recordId}/... pattern. */
function objectApiNameFrom(urlPattern) {
  const m = /\/lightning\/r\/([^/]+)\//.exec(urlPattern || "");
  return m ? m[1] : null;
}

/** Entries that can be captured by navigating to a URL (have a url_pattern). */
function navigableEntries() {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw).filter((s) => s && s.url_pattern);
}

// ----------------------------------------------------------------------------
// Lightning-aware waiting — do NOT trust networkidle (the SPA holds long-poll
// connections open). Wait for a Lightning shell signal, then for spinners to
// clear, then a short settle. Every wait is tolerant so an unusual page (e.g.
// the App Launcher grid) still falls through to the settle delay.
// ----------------------------------------------------------------------------
export async function waitForLightning(page, { settle = 800 } = {}) {
  await page
    .waitForSelector(
      "one-app-nav-bar, .slds-context-bar, .appLauncher, .oneAppLauncherMenu, .forceAppLauncher",
      { timeout: DEFAULT_TIMEOUT }
    )
    .catch(() => {});
  await page
    .waitForFunction(
      () => {
        const spinners = document.querySelectorAll(
          ".slds-spinner, lightning-spinner"
        );
        return ![...spinners].some((el) => {
          const s = window.getComputedStyle(el);
          return (
            s.display !== "none" &&
            s.visibility !== "hidden" &&
            el.offsetParent !== null
          );
        });
      },
      { timeout: DEFAULT_TIMEOUT }
    )
    .catch(() => {});
  await page.waitForTimeout(settle);
}

// ----------------------------------------------------------------------------
// Navigation primitives — exported for recipes that need richer interaction
// than a bare URL (the manifest-driven runner below uses URL navigation, which
// covers the current Order Management shots).
// ----------------------------------------------------------------------------

/** Open an app via the App Launcher (waffle → search → result). */
export async function openApp(page, appName) {
  await page.click('button[title="App Launcher"], .slds-icon-waffle');
  const search = page.locator(
    'input[placeholder*="Search apps"], one-app-launcher-menu input[type="search"]'
  );
  await search.waitFor({ timeout: DEFAULT_TIMEOUT });
  await search.fill(appName);
  await page.waitForTimeout(500);
  await page.click(
    `one-app-launcher-menu a:has-text("${appName}"), .al-menu-dropdown-list a:has-text("${appName}")`
  );
  await waitForLightning(page);
}

/** Click a nav-bar tab, falling back to the "More" overflow menu. */
export async function goToTab(page, label) {
  const direct = page.locator(
    `one-app-nav-bar a[title="${label}"], one-app-nav-bar a:has-text("${label}")`
  );
  if ((await direct.count()) > 0 && (await direct.first().isVisible())) {
    await direct.first().click();
  } else {
    await page
      .locator('one-app-nav-bar button[title="More"], one-app-nav-bar button:has-text("More")')
      .click();
    await page.click(`.slds-dropdown a[title="${label}"], .slds-dropdown a:has-text("${label}")`);
  }
  await waitForLightning(page);
}

/** Open the first record in the current list view. */
export async function openFirstRecordInList(page) {
  const firstLink = page.locator(
    'table[role="grid"] tbody tr a[data-refid="recordId"], ' +
      "lightning-datatable tbody tr th a, " +
      "table.slds-table tbody tr th a"
  );
  await firstLink.first().waitFor({ timeout: DEFAULT_TIMEOUT });
  await firstLink.first().click();
  await waitForLightning(page);
}

/**
 * Navigate to any relative Lightning URL using window.location.assign so the
 * SPA router handles it (a fresh page.goto would re-bootstrap the whole app and
 * can break the session).
 */
export async function spaNavigate(page, relativeUrl) {
  await page.evaluate((u) => window.location.assign(u), relativeUrl);
  await waitForLightning(page);
}

/** Navigate to a record by Id. */
export async function openRecordById(page, id) {
  await spaNavigate(page, `/lightning/r/${id}/view`);
}

/** Click the "New" action and wait for the modal to render. */
export async function clickNew(page) {
  await page.click(
    'div.slds-page-header a[title="New"], button[name="New"], lightning-button:has-text("New") button'
  );
  await page.waitForSelector(".slds-modal", { timeout: DEFAULT_TIMEOUT });
  await waitForLightning(page, { settle: 500 });
}

/** Close an open modal, dismissing the "discard changes?" confirmation. */
export async function closeModal(page) {
  // Double Escape: first closes the modal, second confirms the discard prompt.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

/** Recovery target between shots. */
async function goHome(page) {
  await spaNavigate(page, "/lightning/page/home");
}

// ----------------------------------------------------------------------------
// Manifest-driven runner
// ----------------------------------------------------------------------------
async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const entries = navigableEntries();
  if (entries.length === 0) {
    console.log(`No navigable entries in ${MANIFEST_PATH}; nothing to capture.`);
    return;
  }

  const frontdoorUrl = getFrontdoorUrl();
  // Never log the frontdoor URL (it carries the session). Log origin only.
  const origin = new URL(frontdoorUrl).origin;
  console.log(`Logging in to org origin: ${origin}`);
  console.log(`Capturing ${entries.length} shot(s) from ${MANIFEST_PATH}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  // The one and only page.goto for the whole run.
  await page.goto(frontdoorUrl, { waitUntil: "domcontentloaded" });
  await waitForLightning(page);

  let failures = 0;
  for (const entry of entries) {
    const outPath = path.join(SCREENSHOT_DIR, `${entry.id}.png`);
    if (!RECAPTURE && existsSync(outPath)) {
      console.log(`skip (exists): ${entry.id}`);
      continue;
    }
    try {
      console.log(`capture: ${entry.id}`);
      let relativeUrl = entry.url_pattern;

      // Resolve {recordId} against a live record when the pattern needs one.
      if (relativeUrl.includes("{recordId}")) {
        const objectApiName = objectApiNameFrom(relativeUrl);
        if (!objectApiName) {
          throw new Error(`cannot derive object API name from ${relativeUrl}`);
        }
        const recordId = firstRecordId(objectApiName);
        if (!recordId) {
          throw new Error(`no ${objectApiName} records found to screenshot`);
        }
        relativeUrl = relativeUrl.replace("{recordId}", recordId);
      }

      await spaNavigate(page, relativeUrl);
      await waitForLightning(page, { settle: 600 });
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  saved ${outPath}`);
    } catch (err) {
      failures += 1;
      console.error(`  FAILED ${entry.id}: ${err.message}`);
      await page
        .screenshot({ path: path.join(SCREENSHOT_DIR, `_FAILED-${entry.id}.png`) })
        .catch(() => {});
      // Recover to a known-good page so the next shot starts clean.
      await goHome(page).catch(() => {});
    }
  }

  await browser.close();

  if (failures > 0) {
    console.error(`${failures} shot(s) failed.`);
    process.exit(1);
  }
  console.log("All shots captured.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
