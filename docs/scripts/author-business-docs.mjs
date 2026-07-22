#!/usr/bin/env node
/**
 * The one genuinely-AI step in this pipeline. Everything else in docs/scripts is
 * deterministic (regex/graph over force-app); this script is the only place an LLM
 * writes prose, and it is scoped to touch nothing but docs/business/**.
 *
 * Auth: uses a Claude Pro/Max subscription via CLAUDE_CODE_OAUTH_TOKEN (generated
 * once with `claude setup-token`), NOT a pay-per-token ANTHROPIC_API_KEY. Runs the
 * `claude` CLI headlessly (`claude -p`).
 *
 * SCALING DESIGN (this is the part that matters on a large org, not this demo's
 * 17-component sample):
 *   - We never inline a diff blob into the prompt. A single commit's diff can be
 *     enormous — a fixed-size truncation (the previous version of this script cut
 *     diffs off at 12,000 characters) silently drops real changes past that point,
 *     which is exactly the failure mode "don't miss details on a huge changeset"
 *     is about. Instead, each prompt gets a MANIFEST (path, change type, component,
 *     feature) and Claude reads the actual current file content itself with its
 *     own Read tool — bounded per file, regardless of how big the overall diff is.
 *   - Changed components are grouped by FEATURE (the connected-component clusters
 *     docs/technical/data.json already computes) and processed one feature at a
 *     time, each as its own `claude` invocation with its own bounded context. A
 *     repo-wide refactor touching many unrelated features becomes N focused calls
 *     instead of one call trying to reason about everything at once — this is
 *     both more accurate (each call stays on-topic) and scales to any diff size.
 *   - Within a feature, if the changed-file count still exceeds MAX_FILES_PER_BATCH,
 *     it's chunked further into multiple batches so no single call is ever handed
 *     an unbounded file list. Every changed file is covered by exactly one batch —
 *     nothing is dropped for being "too much."
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { discover } = require('./lib/discover');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const FORCE_APP = path.join(ROOT, 'force-app', 'main', 'default');
const BUSINESS_DIR = path.join(ROOT, 'docs', 'business');
const TEMPLATE_FILE = path.join(BUSINESS_DIR, 'TEMPLATE.md');
const STATE_FILE = path.join(ROOT, 'docs', '_state', 'progress.json');
const TECH_DATA_FILE = path.join(ROOT, 'docs', 'technical', 'data.json');
const MAX_FILES_PER_BATCH = 120;

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString().trim(); }
  catch (e) { return null; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { lastDocumentedCommit: null }; }
}

function classifyForceAppPath(repoRelPath) {
  const marker = 'force-app/main/default/';
  const idx = repoRelPath.indexOf(marker);
  if (idx === -1) return null;
  const rel = repoRelPath.slice(idx + marker.length);
  const base = path.basename(rel);
  if (base.endsWith('.cls') && !base.endsWith('.cls-meta.xml')) return { type: 'ApexClass', name: base.replace(/\.cls$/, '') };
  if (base.endsWith('.trigger') && !base.endsWith('.trigger-meta.xml')) return { type: 'ApexTrigger', name: base.replace(/\.trigger$/, '') };
  if (base.endsWith('.object-meta.xml')) return { type: 'CustomObject', name: base.replace(/\.object-meta\.xml$/, '') };
  if (base.endsWith('.field-meta.xml')) return { type: 'CustomField', name: `${path.basename(path.dirname(path.dirname(rel)))}.${base.replace(/\.field-meta\.xml$/, '')}` };
  if (base.endsWith('.flow-meta.xml')) return { type: 'Flow', name: base.replace(/\.flow-meta\.xml$/, '') };
  if (base.endsWith('.js-meta.xml') && rel.includes('lwc/')) return { type: 'LightningComponentBundle', name: path.basename(path.dirname(rel)) };
  return { type: 'metadata', name: base };
}

const state = loadState();
const headSha = sh('git rev-parse HEAD');

if (!headSha) {
  console.log('Not a git repo (or no commits yet) — skipping AI business-doc authorship.');
  process.exit(0);
}

const isBaseline = !state.lastDocumentedCommit || sh(`git cat-file -e ${state.lastDocumentedCommit}`) === null;
const STATUS_LABEL = { A: 'Added', M: 'Modified', D: 'Removed', R: 'Renamed' };
let changes;

if (isBaseline) {
  // No prior commit to diff against — but that does NOT mean nothing needs docs. A
  // repo that's bootstrapped with a large pre-existing force-app (this project's own
  // history included) would otherwise NEVER get AI-authored business docs for
  // anything in that first commit, forever — the technical layer always does a full
  // sweep (see extract-technical.js) and this needs the same "baseline = everything
  // is new" treatment, not a skip. Every discovered component is treated as Added;
  // step 1 of the prompt below ("read what's already documented first") is what
  // keeps this from duplicating pages for features that already have hand-written
  // docs (e.g. this demo's own Order Management) — it only fills in the gaps.
  console.log('No prior documented commit — treating this as an initial baseline: every discovered ' +
    'component is in scope, but existing docs/business pages are read first so nothing already ' +
    'documented gets duplicated.');
  changes = discover(FORCE_APP).map((c) => ({
    status: 'Added',
    type: c.type,
    name: c.name,
    path: path.join('force-app', 'main', 'default', c.path).split(path.sep).join('/'),
  }));
} else {
  const nameStatusRaw = sh(`git diff --name-status ${state.lastDocumentedCommit}..${headSha} -- force-app`) || '';
  changes = nameStatusRaw.split('\n').filter(Boolean).map((line) => {
    const [statusRaw, ...pathParts] = line.split('\t');
    const filePath = pathParts[pathParts.length - 1];
    const hit = classifyForceAppPath(filePath.split(path.sep).join('/'));
    return hit ? { status: STATUS_LABEL[statusRaw[0]] || 'Modified', path: filePath, ...hit } : null;
  }).filter(Boolean);
}

if (changes.length === 0) {
  console.log('No force-app changes since the last documented commit — nothing for the AI step to write about.');
  process.exit(0);
}

const hasClaudeCli = sh('claude --version') !== null;
if (!hasClaudeCli) {
  console.log('The `claude` CLI is not installed here — skipping AI authorship for this local run.');
  console.log('Install it with: npm install -g @anthropic-ai/claude-code');
  console.log(`Changed files that a CI run WOULD have asked Claude to write up (${changes.length}):`);
  changes.forEach((c) => console.log(`  - ${c.status}: ${c.path}`));
  process.exit(0);
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log('CLAUDE_CODE_OAUTH_TOKEN is not set — skipping AI authorship for this local run.');
  console.log('Generate one with `claude setup-token` (needs a Pro/Max/Team/Enterprise plan) and export it,');
  console.log('or set it as a repo secret for the GitHub Actions workflow.');
  process.exit(0);
}

// ---------- group changed components by feature (docs/technical/data.json) ----------
let featuresByComponent = new Map();
if (fs.existsSync(TECH_DATA_FILE)) {
  try {
    const techData = JSON.parse(fs.readFileSync(TECH_DATA_FILE, 'utf8'));
    for (const feature of techData.features || []) {
      for (const member of feature.members) featuresByComponent.set(member, feature.title);
    }
  } catch (e) { /* proceed without feature grouping — everything falls into "Unmapped" */ }
}

const groups = new Map(); // feature title -> changes[]
for (const c of changes) {
  const feature = featuresByComponent.get(c.name) || 'Unmapped';
  if (!groups.has(feature)) groups.set(feature, []);
  groups.get(feature).push(c);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const template = fs.existsSync(TEMPLATE_FILE) ? fs.readFileSync(TEMPLATE_FILE, 'utf8') : '';

function buildPrompt(featureTitle, batch, batchIndex, batchCount) {
  const manifest = batch.map((c) => `- ${c.status}: \`${c.path}\` (${c.type} \`${c.name}\`)`).join('\n');
  return `You maintain the business/use-case documentation for a Salesforce project, under docs/business/.
Each page is a Markdown file with YAML frontmatter (title, feature, category, description, owner, verified,
prerequisites, related, deprecated, replacement, order, slug) followed by four fixed sections: Overview,
Prerequisites, Steps to Navigate, Validations & Business Rules. Schema template:

---TEMPLATE START---
${template}
---TEMPLATE END---

You are updating docs for ONE feature area: "${featureTitle}"${batchCount > 1 ? ` (batch ${batchIndex + 1} of ${batchCount} for this feature — there are more changed files in this same feature besides the ones listed below; only handle the ones listed here, another batch covers the rest)` : ''}.

${isBaseline
  ? `This is the initial documentation baseline (commit ${headSha.slice(0, 7)}) — the force-app files below\nare this feature's full current membership, not necessarily all newly written today:`
  : `The following force-app files changed for this feature between commit ${state.lastDocumentedCommit.slice(0, 7)}\nand ${headSha.slice(0, 7)} (status: Added/Modified/Removed/Renamed):`}

${manifest}

You do NOT get a diff dump here — for "Added"/"Modified" files, use your Read tool to open the file at the
path above directly (it's the current, already-checked-out version) to see what it actually does now. For
"Removed" files, there is nothing to read; treat that as the component going away.

Your task:
1. Read the existing pages under docs/business/ to find the page(s), if any, documenting "${featureTitle}"
   or these specific components.
2. Read each changed file listed above (skip Removed ones — they no longer exist).
3. UPDATE the matching page's Overview / Steps to Navigate / Validations & Business Rules so they stay
   accurate to what you just read. Preserve everything about the page that is still true; edit only what
   actually changed. If a component was Removed, update the page to reflect that (or mark it deprecated via
   frontmatter if the whole feature it documented is gone).
4. If NONE of these changes map to an existing page and they represent a genuinely new, user-facing feature,
   create ONE new page following the template exactly, in a sensibly-named category folder under
   docs/business/. If the changes are purely technical (e.g. a helper method, an internal refactor) with no
   user-facing effect, do not invent a page — leave the business docs alone.
5. You may ONLY create or edit files under docs/business/. Do not touch anything else in the repo (not
   docs/technical, not docs/scripts, not force-app, not .github).

Make the edits directly. Do not ask for confirmation.`;
}

let totalBatches = 0;
for (const [, list] of groups) totalBatches += chunk(list, MAX_FILES_PER_BATCH).length;
console.log(`Asking Claude to update docs/business/ for ${changes.length} changed file(s) across ${groups.size} feature area(s), in ${totalBatches} batch(es)...`);

// Snapshot what's ALREADY dirty before Claude runs at all — extract-technical.js and
// generate-version-history.js both ran earlier in this same pipeline and legitimately
// leave docs/technical/*.json modified-but-uncommitted at this point. The safety net
// below must only catch files that become dirty DURING this script (i.e. Claude's own
// doing), or it would revert that upstream work right before the later commit step
// ever sees it.
const dirtyBefore = new Set((sh('git status --porcelain') || '').split('\n').filter(Boolean).map((line) => line.slice(3).trim()));

let batchNumber = 0;
let failures = 0;
for (const [featureTitle, list] of groups) {
  const batches = chunk(list, MAX_FILES_PER_BATCH);
  for (let i = 0; i < batches.length; i++) {
    batchNumber++;
    console.log(`[${batchNumber}/${totalBatches}] Feature "${featureTitle}" — ${batches[i].length} file(s)...`);
    const prompt = buildPrompt(featureTitle, batches[i], i, batches.length);
    const result = spawnSync('claude', ['-p', prompt, '--allowedTools', 'Read,Write,Edit', '--permission-mode', 'acceptEdits'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`  claude exited with status ${result.status} for this batch — continuing with the remaining batches.`);
      failures++;
    }
  }
}

// Safety net: even though --allowedTools scopes the CLI's own tools, confirm nothing
// outside docs/business/ was touched before the workflow commits anything. Only files
// that are NEWLY dirty since dirtyBefore count — anything already dirty (technical
// docs regenerated earlier in this pipeline) is left alone.
const dirtyAfter = (sh('git status --porcelain') || '').split('\n').filter(Boolean);
const outOfScope = dirtyAfter
  .map((line) => line.slice(3).trim())
  .filter((f) => f && !f.startsWith('docs/business/') && !dirtyBefore.has(f));

if (outOfScope.length) {
  console.warn(`Claude touched ${outOfScope.length} file(s) outside docs/business/ — reverting those:`);
  outOfScope.forEach((f) => {
    console.warn(`  - ${f}`);
    sh(`git checkout -- "${f}"`);
  });
}

console.log(`AI business-doc authorship step complete${failures ? ` (${failures} of ${totalBatches} batch(es) failed — see log above)` : ''}.`);
