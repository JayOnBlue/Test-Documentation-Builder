'use strict';
/**
 * Single source of truth for "what exists" in force-app.
 * Deliberately simple: this is a demo-scale reimplementation of the discovery
 * step the full production docs engine does with much more nuance.
 */
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Classify a single file, given its path relative to force-app/main/default
 * (forward-slash separated) and its basename. Filesystem-free so it can also
 * classify paths that no longer exist on disk (e.g. from `git diff` on a
 * deleted file) for the changelog generator.
 */
function classify(rel, base) {
  if (base.endsWith('.cls') && !base.endsWith('.cls-meta.xml')) {
    return { type: 'ApexClass', name: base.replace(/\.cls$/, '') };
  }
  if (base.endsWith('.trigger') && !base.endsWith('.trigger-meta.xml')) {
    return { type: 'ApexTrigger', name: base.replace(/\.trigger$/, '') };
  }
  if (base.endsWith('.object-meta.xml')) {
    return { type: 'CustomObject', name: base.replace(/\.object-meta\.xml$/, '') };
  }
  if (base.endsWith('.field-meta.xml')) {
    const objectName = path.basename(path.dirname(path.dirname(rel)));
    return { type: 'CustomField', name: `${objectName}.${base.replace(/\.field-meta\.xml$/, '')}`, parentObject: objectName };
  }
  if (base.endsWith('.flow-meta.xml')) {
    return { type: 'Flow', name: base.replace(/\.flow-meta\.xml$/, '') };
  }
  if (base.endsWith('.js-meta.xml') && (rel.startsWith('lwc/') || rel.includes('/lwc/'))) {
    return { type: 'LightningComponentBundle', name: path.basename(path.dirname(rel)) };
  }
  return null;
}

function discover(forceAppDir) {
  const files = walk(forceAppDir);
  const components = [];

  for (const full of files) {
    const rel = path.relative(forceAppDir, full).split(path.sep).join('/');
    const base = path.basename(full);
    const hit = classify(rel, base);
    if (!hit) continue;

    if (hit.type === 'LightningComponentBundle') {
      const jsFile = path.join(path.dirname(full), `${hit.name}.js`);
      components.push({ ...hit, path: path.dirname(rel), source: fs.existsSync(jsFile) ? jsFile : full });
    } else {
      components.push({ ...hit, path: rel, source: full });
    }
  }

  return components;
}

/** Strip a repo-relative path down to "relative to force-app/main/default", or null if outside it. */
function relToDefault(repoRelPath) {
  const marker = 'force-app/main/default/';
  const idx = repoRelPath.indexOf(marker);
  return idx === -1 ? null : repoRelPath.slice(idx + marker.length);
}

module.exports = { discover, walk, classify, relToDefault };
