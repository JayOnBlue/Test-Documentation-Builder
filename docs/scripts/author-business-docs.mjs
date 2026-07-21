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
 * IMPORTANT — run this BEFORE docs/scripts/generate-changelog.js in the pipeline.
 * Both scripts diff force-app against the same docs/_state/progress.json commit
 * pointer; only generate-changelog.js is allowed to advance that pointer (it does so
 * last). If this script ran after the changelog step, the pointer would already be
 * up to date and there would be nothing left to diff.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BUSINESS_DIR = path.join(ROOT, 'docs', 'business');
const TEMPLATE_FILE = path.join(BUSINESS_DIR, 'TEMPLATE.md');
const STATE_FILE = path.join(ROOT, 'docs', '_state', 'progress.json');

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (e) { return null; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { lastDocumentedCommit: null }; }
}

const state = loadState();
const headSha = sh('git rev-parse HEAD');

if (!headSha) {
  console.log('Not a git repo (or no commits yet) — skipping AI business-doc authorship.');
  process.exit(0);
}
if (!state.lastDocumentedCommit || sh(`git cat-file -e ${state.lastDocumentedCommit}`) === null) {
  console.log('No prior documented commit — this is the initial baseline. Skipping AI authorship on the ' +
    'first run (nothing to diff against yet); it will run starting from the second push.');
  process.exit(0);
}

const changedFiles = (sh(`git diff --name-only ${state.lastDocumentedCommit}..${headSha} -- force-app`) || '')
  .split('\n').filter(Boolean);

if (changedFiles.length === 0) {
  console.log('No force-app changes since the last documented commit — nothing for the AI step to write about.');
  process.exit(0);
}

const hasClaudeCli = sh('claude --version') !== null;
if (!hasClaudeCli) {
  console.log('The `claude` CLI is not installed here — skipping AI authorship for this local run.');
  console.log('Install it with: npm install -g @anthropic-ai/claude-code');
  console.log('Changed files that a CI run WOULD have asked Claude to write up:');
  changedFiles.forEach((f) => console.log(`  - ${f}`));
  process.exit(0);
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log('CLAUDE_CODE_OAUTH_TOKEN is not set — skipping AI authorship for this local run.');
  console.log('Generate one with `claude setup-token` (needs a Pro/Max/Team/Enterprise plan) and export it,');
  console.log('or set it as a repo secret for the GitHub Actions workflow.');
  process.exit(0);
}

const diffSnippet = sh(`git diff ${state.lastDocumentedCommit}..${headSha} -- force-app`) || '';
const template = fs.existsSync(TEMPLATE_FILE) ? fs.readFileSync(TEMPLATE_FILE, 'utf8') : '';

const prompt = `You maintain the business/use-case documentation for a Salesforce project, under docs/business/.
Each page is a Markdown file with YAML frontmatter (title, feature, category, description, prerequisites,
order, slug) followed by four fixed sections: Overview, Prerequisites, Steps to Navigate, Validations &
Business Rules. Here is the schema template:

---TEMPLATE START---
${template}
---TEMPLATE END---

The following force-app metadata changed between commit ${state.lastDocumentedCommit.slice(0, 7)} and
${headSha.slice(0, 7)}:

${changedFiles.map((f) => `- ${f}`).join('\n')}

Full diff for context:
---DIFF START---
${diffSnippet.slice(0, 12000)}
---DIFF END---

Your task:
1. Read the existing pages under docs/business/ to see what's already documented.
2. For each changed component that maps to an existing business feature page, UPDATE that page so its
   Overview / Steps to Navigate / Validations & Business Rules sections stay accurate to the new behavior.
   Preserve everything about the page that is still true; edit only what the diff actually changed.
3. For a changed component that represents a genuinely new feature with no existing page, create ONE new
   page for it following the template exactly, in a sensibly-named category folder under docs/business/.
4. Do not invent business context you can't support from the diff — if a change is purely technical
   (e.g. a helper method with no user-facing effect), leave the business docs alone rather than guessing.
5. You may ONLY create or edit files under docs/business/. Do not touch anything else in the repo
   (not docs/technical, not docs/scripts, not force-app, not .github).

Make the edits directly. Do not ask for confirmation.`;

console.log(`Asking Claude to update docs/business/ for ${changedFiles.length} changed file(s)...`);

const result = spawnSync('claude', ['-p', prompt, '--allowedTools', 'Read,Write,Edit', '--permission-mode', 'acceptEdits'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error(`claude exited with status ${result.status} — leaving docs/business/ as-is.`);
  process.exit(0); // don't fail the whole pipeline over the interpretive layer
}

// Safety net: even though --allowedTools scopes the CLI's own tools, confirm nothing
// outside docs/business/ was touched before the workflow commits anything.
const dirty = (sh('git status --porcelain') || '').split('\n').filter(Boolean);
const outOfScope = dirty
  .map((line) => line.slice(3).trim())
  .filter((f) => f && !f.startsWith('docs/business/'));

if (outOfScope.length) {
  console.warn(`Claude touched ${outOfScope.length} file(s) outside docs/business/ — reverting those:`);
  outOfScope.forEach((f) => {
    console.warn(`  - ${f}`);
    sh(`git checkout -- "${f}"`);
  });
}

console.log('AI business-doc authorship step complete.');
