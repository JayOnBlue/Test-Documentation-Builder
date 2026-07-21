'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** Last-modified timestamp for a file: git history if available, else mtime. */
function gitLastModified(root, absPath) {
  try {
    const rel = path.relative(root, absPath).split(path.sep).join('/');
    const out = execSync(`git log -1 --format=%aI -- "${rel}"`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch (e) { /* not a git repo, or no history for this file yet */ }
  try { return fs.statSync(absPath).mtime.toISOString(); } catch (e) { return null; }
}

/** ~200 words/minute, minimum 1 minute. */
function readTimeMinutes(plainText) {
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

module.exports = { gitLastModified, readTimeMinutes };
