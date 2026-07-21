#!/usr/bin/env node
'use strict';
/**
 * Deterministic technical-docs extractor. Zero AI, zero network calls —
 * regex-based static analysis over force-app, same philosophy as the
 * production docs/scripts engine this demo is modeled on, simplified to
 * fit a small example. Writes docs/technical/data.json, which the
 * technical-docs UI (docs/technical/app.js) renders client-side.
 */
const fs = require('fs');
const path = require('path');
const { discover } = require('./lib/discover');

const ROOT = path.join(__dirname, '..', '..');
const FORCE_APP = path.join(ROOT, 'force-app', 'main', 'default');
const OUT_DIR = path.join(ROOT, 'docs', 'technical');
const OUT_FILE = path.join(OUT_DIR, 'data.json');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

function readSource(component) {
  try { return fs.readFileSync(component.source, 'utf8'); } catch (e) { return ''; }
}

const components = discover(FORCE_APP);
const byName = new Map(components.map((c) => [c.name, c]));
const classNames = components.filter((c) => c.type === 'ApexClass').map((c) => c.name);

const edges = [];
function addEdge(from, to, type, confidence) {
  if (!from || !to || from === to) return;
  if (!byName.has(to)) return; // only edge to known components
  edges.push({ from, to, type, confidence: confidence || 'High' });
}

const methodsByComponent = new Map();

for (const c of components) {
  if (c.type === 'ApexClass') {
    const clean = stripComments(readSource(c));

    const methods = [];
    const methodRe = /\b(public|private|protected|global)\s+(?:static\s+)?(?:override\s+)?(?:testMethod\s+)?[\w<>,\[\]]+\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = methodRe.exec(clean))) {
      if (m[2] === c.name) continue; // skip constructor
      const isAura = /@AuraEnabled/.test(clean.slice(Math.max(0, m.index - 40), m.index));
      const isFuture = /@future/.test(clean.slice(Math.max(0, m.index - 20), m.index));
      methods.push({ name: m[2], signature: `${m[1]} ${m[2]}(${m[3].trim()})`, auraEnabled: isAura, future: isFuture });
    }
    methodsByComponent.set(c.name, methods);

    for (const other of classNames) {
      if (other === c.name) continue;
      if (new RegExp(`new\\s+${other}\\s*\\(`).test(clean)) addEdge(c.name, other, 'constructs');
      else if (new RegExp(`\\b${other}\\.`).test(clean)) addEdge(c.name, other, 'calls_method');
    }

    const soqlRe = /\bFROM\s+(\w+)/gi;
    while ((m = soqlRe.exec(clean))) addEdge(c.name, m[1], 'soql_read', 'High');

    const dmlRe = /\b(?:insert|update|upsert|delete)\s+(\w+)\b/g;
    while ((m = dmlRe.exec(clean))) {
      const varName = m[1];
      const typeMatch = clean.match(new RegExp(`List<\\s*(\\w+)\\s*>\\s*${varName}\\b`))
        || clean.match(new RegExp(`\\b(\\w+)\\s+${varName}\\s*=`));
      if (typeMatch) addEdge(c.name, typeMatch[1], 'dml_write', 'Medium');
    }
  }

  if (c.type === 'ApexTrigger') {
    const clean = stripComments(readSource(c));
    const trigOn = clean.match(/trigger\s+\w+\s+on\s+(\w+)\s*\(/);
    if (trigOn) addEdge(c.name, trigOn[1], 'trigger_on', 'High');
    for (const other of classNames) {
      if (new RegExp(`\\b${other}\\.`).test(clean)) addEdge(c.name, other, 'handled_by', 'High');
    }
  }

  if (c.type === 'LightningComponentBundle') {
    const clean = readSource(c);
    const importRe = /@salesforce\/apex\/(\w+)\.(\w+)/g;
    let m;
    while ((m = importRe.exec(clean))) {
      const wired = new RegExp(`@wire\\([^)]*${m[2]}`).test(clean);
      addEdge(c.name, m[1], wired ? 'wire_adapter' : 'apex_import', 'High');
    }
  }

  if (c.type === 'Flow') {
    const xml = readSource(c);
    const obj = xml.match(/<object>(\w+)<\/object>/);
    if (obj) addEdge(c.name, obj[1], 'trigger_on', 'High');
  }

  if (c.type === 'CustomField') {
    const xml = readSource(c);
    const ref = xml.match(/<referenceTo>(\w+)<\/referenceTo>/);
    if (ref && c.parentObject !== ref[1]) addEdge(c.parentObject, ref[1], 'references_object', 'High');
  }
}

const seenEdgeKeys = new Set();
const dedupedEdges = edges.filter((e) => {
  const key = `${e.from}|${e.to}|${e.type}`;
  if (seenEdgeKeys.has(key)) return false;
  seenEdgeKeys.add(key);
  return true;
});
edges.length = 0;
edges.push(...dedupedEdges);

const usedBy = new Map();
for (const e of edges) {
  if (!usedBy.has(e.to)) usedBy.set(e.to, []);
  usedBy.get(e.to).push(e);
}
const dependsOn = new Map();
for (const e of edges) {
  if (!dependsOn.has(e.from)) dependsOn.set(e.from, []);
  dependsOn.get(e.from).push(e);
}

const componentDetails = components.map((c) => ({
  name: c.name,
  type: c.type,
  path: c.path,
  methods: methodsByComponent.get(c.name) || [],
  dependsOn: (dependsOn.get(c.name) || []).map((e) => ({ name: e.to, type: byName.get(e.to)?.type, relationship: e.type, confidence: e.confidence })),
  usedBy: (usedBy.get(c.name) || []).map((e) => ({ name: e.from, type: byName.get(e.from)?.type, relationship: e.type, confidence: e.confidence })),
  health: 'unreviewed',
  purpose: null,
}));

const byType = {};
for (const c of components) byType[c.type] = (byType[c.type] || 0) + 1;
const byRelationship = {};
for (const e of edges) byRelationship[e.type] = (byRelationship[e.type] || 0) + 1;

fs.mkdirSync(OUT_DIR, { recursive: true });

let version = 1;
if (fs.existsSync(OUT_FILE)) {
  try { version = (JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')).version || 0) + 1; } catch (e) { /* start fresh */ }
}

const data = {
  generatedAt: new Date().toISOString(),
  version,
  componentCount: components.length,
  edgeCount: edges.length,
  componentsByType: byType,
  edgesByRelationship: byRelationship,
  components: componentDetails,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));
console.log(`docs/technical/data.json written — ${components.length} components, ${edges.length} edges (v${version})`);
