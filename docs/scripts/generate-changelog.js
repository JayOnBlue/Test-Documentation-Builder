#!/usr/bin/env node
'use strict';
/**
 * Deterministic changelog: diffs force-app against the last commit this
 * pipeline documented (not the commit message), classifies each changed
 * file by metadata type, and writes one dated Markdown entry. Falls back to
 * "initial baseline" the first time it runs (no prior commit recorded, or
 * not inside a git repo at all).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { discover, classify } = require('./lib/discover');

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

function relToDefault(repoRelPath) {
  const marker = 'force-app/main/default/';
  const idx = repoRelPath.indexOf(marker);
  return idx === -1 ? null : repoRelPath.slice(idx + marker.length);
}

const state = loadState();
const headSha = sh('git rev-parse HEAD');
const inGitRepo = headSha !== null;

const STATUS_LABEL = { A: 'Added', M: 'Modified', D: 'Removed', R: 'Renamed' };
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
    entries.push({ status: 'Added', type: c.type, name: c.type === 'LightningComponentBundle' ? c.name : c.name, path: c.path });
  }
}

// De-dupe (a field + its parent object edited together, etc. still list separately, but
// the same file touched by more than one diff line should only appear once).
const seen = new Set();
const deduped = entries.filter((e) => {
  const key = `${e.status}|${e.type}|${e.name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const dateStr = new Date().toISOString().slice(0, 10);
const shortSha = headSha ? headSha.slice(0, 7) : 'local';

let body;
if (deduped.length === 0) {
  body = null; // nothing changed under force-app — don't write an empty entry
} else if (!inGitRepo || !state.lastDocumentedCommit) {
  const byType = {};
  for (const e of deduped) (byType[e.type] = byType[e.type] || []).push(e);
  const lines = [`## ${dateStr} — Initial documentation baseline`, ''];
  for (const [type, items] of Object.entries(byType)) {
    lines.push(`**${type}** (${items.length})`, '');
    for (const item of items) lines.push(`- \`${item.name}\``);
    lines.push('');
  }
  body = lines.join('\n');
} else {
  const byType = {};
  for (const e of deduped) (byType[e.type] = byType[e.type] || []).push(e);
  const lines = [`## ${dateStr} — ${shortSha}`, ''];
  for (const [type, items] of Object.entries(byType)) {
    lines.push(`**${type}**`, '');
    for (const item of items) lines.push(`- ${item.status}: \`${item.name}\``);
    lines.push('');
  }
  body = lines.join('\n');
}

if (body) {
  const existing = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, 'utf8') : '# Changelog\n\nGenerated from force-app metadata changes on every push to main.\n\n';
  fs.writeFileSync(CHANGELOG_FILE, existing.trimEnd() + '\n\n' + body + '\n');
  console.log(`docs/CHANGELOG.md updated — ${deduped.length} changed component(s)`);
} else {
  console.log('No force-app changes since last documented commit — changelog untouched.');
}

if (inGitRepo) {
  saveState({ lastDocumentedCommit: headSha });
}
