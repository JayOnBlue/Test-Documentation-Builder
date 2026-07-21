#!/usr/bin/env node
'use strict';
/**
 * Deterministic version history: turns `git log` on force-app/ into the
 * GitHub-commit-style timeline the site's Version History page renders.
 * Writes docs/technical/versions.json (generated — never hand-edit).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { classify, relToDefault } = require('./lib/discover');

const ROOT = path.join(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'docs', 'technical', 'versions.json');
const MAX_COMMITS = 30;
const FS = '\x1f'; // unit separator, won't collide with commit subjects

const AVATAR_PALETTE = ['#6455f0', '#2563eb', '#0ea5a3', '#d97706', '#dc2626', '#7c3aed', '#059669', '#db2777'];

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

const log = sh(`git log --format=%H${FS}%an${FS}%aI${FS}%s -n ${MAX_COMMITS} -- force-app`) || '';
const commits = log.trim().split('\n').filter(Boolean).map((line) => {
  const [hash, author, date, subject] = line.split(FS);
  return { hash, author, date, subject };
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
    if (m) { current = m[1]; componentChangesByHash.set(current, { added: new Set(), removed: new Set() }); continue; }
    const nm = line.match(/^([AMD])\d*\t(.+)$/);
    if (nm && current) {
      const rel = relToDefault(nm[2].split(path.sep).join('/'));
      if (!rel) continue;
      const hit = classify(rel, path.basename(rel));
      if (!hit) continue;
      const bucket = componentChangesByHash.get(current);
      if (nm[1] === 'A') bucket.added.add(hit.name);
      else if (nm[1] === 'D') bucket.removed.add(hit.name);
    }
  }
}

const total = commits.length;
const versions = commits.map((c, i) => {
  const stats = statsByHash.get(c.hash) || { additions: 0, deletions: 0, filesChanged: 0 };
  const changes = componentChangesByHash.get(c.hash) || { added: new Set(), removed: new Set() };
  return {
    version: `v${total - i}`,
    hash: c.hash.slice(0, 7),
    when: c.date,
    author: c.author,
    initials: initialsOf(c.author),
    avatarBg: colorFor(c.author),
    latest: i === 0,
    summary: c.subject,
    filesChanged: stats.filesChanged,
    additions: stats.additions,
    deletions: stats.deletions,
    added: Array.from(changes.added),
    removed: Array.from(changes.removed),
  };
});

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ versions }, null, 2));
console.log(`docs/technical/versions.json written — ${versions.length} commit(s) touching force-app`);
