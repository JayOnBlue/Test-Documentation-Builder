# Screenshot capture with CumulusCI + Robot Framework (SalesforcePlaywright)

This is the **interaction-aware** capture harness — the approach Salesforce itself uses for testing.
It performs real UI steps against the Order Management demo org: opening the **App Launcher**,
clicking into the **Order Management** app, clicking the **Orders** tab, clicking **New** and filling
in a form to **create an Order record**, then opening that record's detail page — then screenshots
each step. It's built on CumulusCI's
[`SalesforcePlaywright`](https://cumulusci.readthedocs.io/en/stable/robot-playwright.html) library, so
it understands Salesforce navigation out of the box.

## What it captures

Four screenshots, matching the four things this harness demonstrates end-to-end (see
`robot/OrderDemo/tests/docs_capture.robot`):

1. **`order-lifecycle-app-launcher`** — the App Launcher open, searching "Order Management".
2. **`order-lifecycle-orders-tab`** — the Orders tab, reached by clicking the app tile then the tab.
3. **`order-lifecycle-create-order`** — the New Order form filled in, before saving.
4. **`order-lifecycle-record-page`** — the Order record just created, opened by its detail page.

A first, single-navigation pass (`Capture Navigable Pages`) also covers every entry in
`../docs/screenshot-manifest.json` that has a `url_pattern` — including resolving `{recordId}` via
SOQL (`SELECT Id FROM <Object> LIMIT 1`) for any future record-page shot with nothing to configure.
The four dedicated test cases above run afterward and overwrite their ids with the real interactive
capture.

## One-time setup

```bash
cd robot-capture

# 1) Install CumulusCI (brings Robot Framework + the Browser/SalesforcePlaywright libraries)
python -m pip install --upgrade cumulusci        # or: pipx install cumulusci

# 2) Install the Playwright browser binaries the Browser library uses
rfbrowser init

# 3) CumulusCI works inside a project dir with a git repo. This folder has cumulusci.yml;
#    if cci complains about git, initialise one (or just run this from the pushed repo root).
```

## Local control panel — the only way this runs (no GitHub Actions, no secrets)

There is deliberately no GitHub Actions workflow for capture, no Connected App, no JWT certificate,
and no repo secrets to configure. A cloud CI runner has no browser and no access to your Salesforce
session, so authenticating it headlessly would always mean *some* stored credential (a JWT cert, a
long-lived auth URL, etc.) — exactly the setup friction and fragile-format problems this project ran
into earlier. Since a real capture needs a real logged-in browser session anyway, that session — and
the page you drive it from — lives on your machine instead:

```bash
cd robot-capture
npm start
```

This opens **http://localhost:4322** in your default browser automatically. From there:

1. **Pick an org** from the dropdown — orgs your Salesforce CLI is already logged into, no
   passkey/MFA prompt. **Not listed?** Type an alias into "Log in to a new org" and click it — this
   runs a real `sf org login web` and opens the actual Salesforce login in your browser (MFA/passkey
   will apply here, since it's a genuinely new session), then adds it to the dropdown.
2. **Click Capture & Build.** You don't need to run `cci org import` yourself first — the panel does
   that on every click, so the connection stays fresh.
3. **The result is pushed to GitHub automatically** (see the checkbox below) — using your own local
   git identity and push access, the same as if you ran `git push` yourself.

No `npm install` is needed anywhere in this flow; the server has zero dependencies.

What the checkboxes do:

- **Re-capture existing images** — passes `-o vars FORCE:True` to `cci task run capture_docs`, which
  bypasses the skip-if-already-captured logic described below and redoes all 4 screenshots.
- **Rebuild site when done** — runs `node docs/scripts/build-site.js` again after capture so
  `docs/site/index.html` immediately shows the new images instead of "Screenshot pending" placeholders.
- **Commit & push to GitHub when done** (on by default) — stages `docs/images/` and
  `docs/screenshot-manifest.json`, commits, and pushes from this machine. If nothing changed (every
  shot was skipped), it says so instead of creating an empty commit. After a successful push it also
  tries `gh workflow run docs-pipeline.yml` (needs the `gh` CLI, already authenticated) so the
  **deployed** GitHub Pages site picks up the new images too — a plain `git push` of `docs/images/`
  alone wouldn't trigger that workflow, since its `push` trigger only watches `force-app/**`. If `gh`
  isn't available this step just logs a note instead of failing the run.

The log box streams each command's real output live, including Robot Framework's own progress. For
the full pass/fail/skip detail of a run, see `robot-capture/robot/OrderDemo/results/log.html`.

## Deploy the demo metadata (once per org)

The Order Management app/tab and the docs-capture permission set aren't in every org yet — deploy
them, then assign the permission set to whichever user's session will run the capture:

```bash
sf project deploy start --source-dir ../force-app --target-org <org>
sf org assign permset --name Order_Management_Docs --target-org <org>
```

## Connect your org — reuses an already-authenticated session, no new login, no MFA/passkey

The control panel above does this for you on every click. To do it by hand from a terminal instead:

```bash
cci org import <sf alias/username> ci      # e.g.: cci org import QuintJMSandbox ci
cci org list                               # confirm "ci" is listed
```

## Capture (manual — what the control panel does under the hood)

Make sure the manifest exists (it's generated by the site build, from the `screenshot` blocks in
`../docs/business/**/*.md`):

```bash
cd .. && node docs/scripts/build-site.js && cd robot-capture
```

Then run the capture (either form works):

```bash
cci task run capture_docs --org ci
# or explicitly:
cci task run robot --org ci -o suites robot/OrderDemo/tests/docs_capture.robot
```

Images are written to **`../docs/images/<screenshot-id>.png`**. Rebuild the site to show them:

```bash
cd .. && node docs/scripts/build-site.js
```

Robot's own logs/report (great for debugging a failed step) land in `robot/OrderDemo/results/`.

## Adding more interactive captures

Open `robot/OrderDemo/tests/docs_capture.robot` and add a test case per interactive screenshot,
ending with `Capture Screenshot As <screenshot-id>`. Keyword references:

- SalesforcePlaywright / CumulusCI keywords: https://cumulusci.readthedocs.io/en/stable/Keywords.html
- Browser (Playwright) keywords: https://marketsquare.github.io/robotframework-browser/Browser.html
- Locator strategies: https://cumulusci.readthedocs.io/en/stable/robot-locators.html

## Notes

- The App Launcher and New Order form selectors are pragmatic (`button[title="App Launcher"]`,
  `input[name="Customer_Email__c"]`, etc.), the same style CumulusCI/Salesforce QA suites use. If a
  selector ever drifts with a Salesforce release or a different page layout, adjust it in
  `resources/OrderDemo.resource` or the affected test case.
- This harness writes directly into `../docs/images` — the same folder the doc site's build script
  (`../docs/scripts/build-site.js`) reads from, so there's nothing else to wire up.
