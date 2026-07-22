#!/usr/bin/env node
'use strict';
/**
 * Deterministic version history: turns `git log` on force-app/ into the
 * GitHub-commit-style timeline the site's Version History page renders.
 * Writes docs/technical/versions.json (generated — never hand-edit).
 *
 * Beyond the raw diff stat, each entry also gets two DERIVED (not AI-written)
 * summaries: a technical one (what kinds of components changed) and a business
 * one (which business feature — from docs/technical/data.json's connected-
 * component clusters — those components belong to). Both are plain
 * cross-references over data this pipeline already computes, not prose from a
 * model — labeled as such wherever the UI shows them.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { classify, relToDefault } = require('./lib/discover');
const { loadFeatureMap, loadComponentTypes, summarizeImpact } = require('./lib/impact');

const ROOT = path.join(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'docs', 'technical', 'versions.json');
const TECH_DATA_FILE = path.join(ROOT, 'docs', 'technical', 'data.json');
const MAX_COMMITS = 30;
const FS = '\x1f'; // unit separator — field boundary within one commit record
const RS = '\x1e'; // record separator — boundary between commits (commit bodies may contain newlines)

const AVATAR_PALETTE = ['#0284c7', '#0891b2', '#0d9488', '#2563eb', '#0369a1', '#0e7490', '#155e75', '#1d4ed8'];
const STATUS_LABEL = { A: 'Added', M: 'Modified', D: 'Removed' };

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  catch (e) { return null; }
}

function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

const headSha = sh('git rev-parse HEAD');
if (!headSha) {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ versions: [] }, null, 2));
  console.log('Not a git repo — wrote an empty docs/technical/versions.json.');
  process.exit(0);
}

// Feature membership + component types, for the impact cross-reference.
// Best-effort: if extract-technical.js hasn't run yet, these are just empty
// and the summaries degrade to "no components changed" / no feature match.
const featuresByComponent = loadFeatureMap(TECH_DATA_FILE);
const componentTypeByName = loadComponentTypes(TECH_DATA_FILE);

const rawLog = sh(`git log --format=%H${FS}%an${FS}%aI${FS}%s${FS}%b${RS} -n ${MAX_COMMITS} -- force-app`) || '';
const commits = rawLog.split(RS).map((rec) => rec.replace(/^\n/, '')).filter(Boolean).map((rec) => {
  const [hash, author, date, subject, ...bodyParts] = rec.split(FS);
  return { hash, author, date, subject, body: (bodyParts.join(FS) || '').trim() };
});

const numstatRaw = sh(`git log --numstat --format=__C__%H -n ${MAX_COMMITS} -- force-app`) || '';
const statsByHash = new Map();
{
  let current = null;
  for (const line of numstatRaw.split('\n')) {
    const m = line.match(/^__C__(\w+)/);
    if (m) { current = m[1]; statsByHash.set(current, { additions: 0, deletions: 0, filesChanged: 0 }); continue; }
    const nm = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (nm && current) {
      const s = statsByHash.get(current);
      s.additions += nm[1] === '-' ? 0 : parseInt(nm[1], 10);
      s.deletions += nm[2] === '-' ? 0 : parseInt(nm[2], 10);
      s.filesChanged += 1;
    }
  }
}

const nameStatusRaw = sh(`git log --name-status --format=__C__%H -n ${MAX_COMMITS} -- force-app`) || '';
const componentChangesByHash = new Map();
{
  let current = null;
  for (const line of nameStatusRaw.split('\n')) {
    const m = line.match(/^__C__(\w+)/);
    if (m) { current = m[1]; componentChangesByHash.set(current, { added: new Set(), modified: new Set(), removed: new Set() }); continue; }
    const nm = line.match(/^([AMD])\d*\t(.+)$/);
    if (nm && current) {
      const rel = relToDefault(nm[2].split(path.sep).join('/'));
      if (!rel) continue;
      const hit = classify(rel, path.basename(rel));
      if (!hit) continue;
      const bucket = componentChangesByHash.get(current);
      if (nm[1] === 'A') bucket.added.add(hit.name);
      else if (nm[1] === 'D') bucket.removed.add(hit.name);
      else bucket.modified.add(hit.name);
    }
  }
}

const total = commits.length;

const versions = commits.map((c, i) => {
  const stats = statsByHash.get(c.hash) || { additions: 0, deletions: 0, filesChanged: 0 };
  const changes = componentChangesByHash.get(c.hash) || { added: new Set(), modified: new Set(), removed: new Set() };
  const groupedNames = { Added: Array.from(changes.added), Modified: Array.from(changes.modified), Removed: Array.from(changes.removed) };
  const impact = summarizeImpact(groupedNames, componentTypeByName, featuresByComponent);
  return {
    version: `v${total - i}`,
    hash: c.hash.slice(0, 7),
    when: c.date,
    author: c.author,
    initials: initialsOf(c.author),
    avatarBg: colorFor(c.author),
    latest: i === 0,
    summary: c.subject,
    description: c.body,
    filesChanged: stats.filesChanged,
    additions: stats.additions,
    deletions: stats.deletions,
    added: groupedNames.Added,
    modified: groupedNames.Modified,
    removed: groupedNames.Removed,
    technicalSummary: impact.technicalText,
    businessSummary: impact.businessText,
    businessFeatures: impact.features,
  };
});

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ versions }, null, 2));
console.log(`docs/technical/versions.json written — ${versions.length} commit(s) touching force-app`);
