#!/usr/bin/env node
'use strict';
/**
 * Deterministic changelog: diffs force-app against the last commit this
 * pipeline documented (not the commit message), classifies each changed file
 * by metadata type, and appends one "release" entry to docs/CHANGELOG.md —
 * grouped into Added / Changed / Removed (rendered on the site as GitHub
 * Releases-style Features / Improvements / Fixes), with contributors and a
 * compare link when the origin remote resolves to a GitHub repo.
 *
 * The Markdown file is the database: the site's changelog page is parsed
 * straight out of these ## / ### headings, nothing is duplicated into JSON.
 *
 * Falls back to "initial baseline" the first time it runs (no prior commit
 * recorded, or not inside a git repo at all).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { discover, classify, relToDefault } = require('./lib/discover');

const ROOT = path.join(__dirname, '..', '..');
const FORCE_APP = path.join(ROOT, 'force-app', 'main', 'default');
const STATE_FILE = path.join(ROOT, 'docs', '_state', 'progress.json');
const CHANGELOG_FILE = path.join(ROOT, 'docs', 'CHANGELOG.md');

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (e) { return null; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { lastDocumentedCommit: null }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function compareUrl(fromSha, toSha) {
  const remote = sh('git remote get-url origin');
  if (!remote) return null;
  const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}/compare/${fromSha}...${toSha}`;
}

const state = loadState();
const headSha = sh('git rev-parse HEAD');
const inGitRepo = headSha !== null;

const STATUS_LABEL = { A: 'Added', M: 'Modified', D: 'Removed', R: 'Renamed' };
const GROUP_FOR_STATUS = { Added: 'Added', Modified: 'Changed', Removed: 'Removed', Renamed: 'Changed' };
const entries = []; // { status, type, name, path }

if (inGitRepo && state.lastDocumentedCommit && sh(`git cat-file -e ${state.lastDocumentedCommit}`) !== null) {
  const diff = sh(`git diff --name-status ${state.lastDocumentedCommit}..${headSha} -- force-app`) || '';
  for (const line of diff.split('\n').filter(Boolean)) {
    const [statusRaw, ...pathParts] = line.split('\t');
    const filePath = pathParts[pathParts.length - 1];
    const status = STATUS_LABEL[statusRaw[0]] || 'Modified';
    const rel = relToDefault(filePath.split(path.sep).join('/'));
    if (!rel) continue;
    const hit = classify(rel, path.basename(rel));
    if (!hit) continue;
    entries.push({ status, type: hit.type, name: hit.name, path: rel });
  }
} else {
  for (const c of discover(FORCE_APP)) {
    entries.push({ status: 'Added', type: c.type, name: c.name, path: c.path });
  }
}

const seen = new Set();
const deduped = entries.filter((e) => {
  const key = `${e.status}|${e.type}|${e.name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

if (deduped.length === 0) {
  console.log('No force-app changes since the last documented commit — changelog untouched.');
  if (inGitRepo) saveState({ ...state, lastDocumentedCommit: headSha });
  process.exit(0);
}

const existingChangelog = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, 'utf8') : '';
const releaseNumber = (existingChangelog.match(/^## v\d+/gm) || []).length + 1;
const dateStr = new Date().toISOString().slice(0, 10);
const shortSha = headSha ? headSha.slice(0, 7) : 'local';

const isBaseline = !inGitRepo || !state.lastDocumentedCommit;
const contributors = isBaseline
  ? (sh('git log -1 --format=%an') ? [sh('git log -1 --format=%an')] : ['local'])
  : Array.from(new Set((sh(`git log --format=%an ${state.lastDocumentedCommit}..${headSha}`) || '').split('\n').filter(Boolean)));

const grouped = { Added: [], Changed: [], Removed: [] };
for (const e of deduped) grouped[GROUP_FOR_STATUS[e.status]].push(e);

const lines = [];
lines.push(`## v${releaseNumber} — ${dateStr}${inGitRepo ? ` — ${shortSha}` : ''}`, '');
lines.push(`**Contributors:** ${contributors.join(', ')}`, '');
if (!isBaseline) {
  const cmp = compareUrl(state.lastDocumentedCommit.slice(0, 7), shortSha);
  if (cmp) lines.push(`**Compare:** [${state.lastDocumentedCommit.slice(0, 7)}...${shortSha}](${cmp})`, '');
}
for (const [group, items] of Object.entries(grouped)) {
  if (!items.length) continue;
  lines.push(`### ${group}`, '');
  for (const item of items) lines.push(`- **${item.type}** \`${item.name}\``);
  lines.push('');
}
const body = lines.join('\n');

// Prepend the new release right after the fixed top header (before any existing "## v..." entries) so the file reads newest-first.
const firstReleaseIdx = existingChangelog.indexOf('\n## v');
let output;
if (!existingChangelog) {
  output = '# Changelog\n\nGenerated from force-app metadata changes on every push to main. Newest first (each release is prepended).\n\n' + body + '\n';
} else if (firstReleaseIdx === -1) {
  output = existingChangelog.trimEnd() + '\n\n' + body + '\n';
} else {
  output = existingChangelog.slice(0, firstReleaseIdx + 1) + body + '\n' + existingChangelog.slice(firstReleaseIdx + 1);
}

fs.writeFileSync(CHANGELOG_FILE, output);
console.log(`docs/CHANGELOG.md updated — v${releaseNumber}, ${deduped.length} changed component(s)`);

if (inGitRepo) {
  saveState({ ...state, lastDocumentedCommit: headSha });
}
