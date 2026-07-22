#!/usr/bin/env node
'use strict';
/**
 * Deterministic technical-docs extractor. Zero AI, zero network calls —
 * regex-based static analysis over force-app. Writes docs/technical/data.json,
 * the single data source for the unified site's technical pages (Overview,
 * Component Index, class/object detail, Features).
 *
 * "Coverage" and "health" here are a STATIC PROXY, not a real Apex code-coverage
 * run: a class counts as covered if some *Test class in the repo references it.
 * This is clearly labeled as a heuristic everywhere the UI shows it — it is not
 * a substitute for actually running tests in an org.
 */
const fs = require('fs');
const path = require('path');
const { discover } = require('./lib/discover');
const { gitLastModified } = require('./lib/util');

const ROOT = path.join(__dirname, '..', '..');
const FORCE_APP = path.join(ROOT, 'force-app', 'main', 'default');
const OUT_DIR = path.join(ROOT, 'docs', 'technical');
const OUT_FILE = path.join(OUT_DIR, 'data.json');

const OWNER_BY_TYPE = {
  ApexClass: 'Platform Engineering',
  ApexTrigger: 'Platform Engineering',
  CustomObject: 'Data Architecture',
  CustomField: 'Data Architecture',
  Flow: 'Automation Team',
  LightningComponentBundle: 'Frontend Guild',
};

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

function readSource(component) {
  try { return fs.readFileSync(component.source, 'utf8'); } catch (e) { return ''; }
}

function qualityFromCoverage(coverage) {
  if (coverage == null) return null;
  if (coverage >= 75) return 'High';
  if (coverage >= 50) return 'Medium';
  return 'Low';
}
function healthFromCoverage(coverage) {
  if (coverage == null) return 'n/a';
  return coverage >= 75 ? 'good' : 'warn';
}

const components = discover(FORCE_APP);
const byName = new Map(components.map((c) => [c.name, c]));
const classNames = components.filter((c) => c.type === 'ApexClass').map((c) => c.name);

const edges = [];
function addEdge(from, to, type, confidence, method) {
  if (!from || !to || from === to) return;
  if (!byName.has(to)) return; // only edge to known components
  edges.push({ from, to, type, confidence: confidence || 'High', method: method || null });
}

const methodsByComponent = new Map();
const isTestClass = new Map(); // name -> boolean

for (const c of components) {
  if (c.type === 'ApexClass') {
    const raw = readSource(c);
    const clean = stripComments(raw);
    isTestClass.set(c.name, /@IsTest/i.test(clean) || /Test$/.test(c.name));

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
      addEdge(c.name, m[1], wired ? 'wire_adapter' : 'apex_import', 'High', m[2]);
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
  const key = `${e.from}|${e.to}|${e.type}|${e.method || ''}`;
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

// ---------- coverage heuristic (static proxy, not a real test-run) ----------
const anyTestClassExists = classNames.some((n) => isTestClass.get(n));
function coverageFor(name) {
  const c = byName.get(name);
  if (!c || c.type !== 'ApexClass' || isTestClass.get(name)) return null;
  const referencedByTest = (usedBy.get(name) || []).some((e) =>
    ['calls_method', 'constructs'].includes(e.type) && isTestClass.get(e.from));
  if (referencedByTest) return 85;
  return anyTestClassExists ? 40 : 15;
}

// ---------- security heuristic ----------
function securityFindingsFor(name) {
  const own = dependsOn.get(name) || [];
  const hasSoql = own.some((e) => e.type === 'soql_read');
  const hasDml = own.some((e) => e.type === 'dml_write');
  const findings = [];
  if (hasSoql) findings.push({ severity: 'warning', label: 'No USER_MODE on SOQL', note: 'SOQL without WITH USER_MODE / as user — FLS/CRUD is not automatically enforced on the query results.' });
  if (hasDml) findings.push({ severity: 'warning', label: 'No CRUD check on DML', note: 'DML without a Security.stripInaccessible or isCreateable()/isUpdateable() guard — assumes the running user has object/field access.' });
  return findings;
}

// ---------- object schemas ----------
const schemas = {};
for (const c of components) {
  if (c.type === 'CustomObject') {
    const xml = readSource(c);
    const label = (xml.match(/<label>(.*?)<\/label>/) || [])[1] || c.name;
    schemas[c.name] = { label, apiName: c.name, fields: [], recordTypes: [], relationships: [] };
  }
}
for (const c of components) {
  if (c.type === 'CustomField' && schemas[c.parentObject]) {
    const xml = readSource(c);
    const label = (xml.match(/<label>(.*?)<\/label>/) || [])[1] || c.name.split('.').pop();
    const fieldType = (xml.match(/<type>(\w+)<\/type>/) || [])[1] || 'Text';
    const required = /<required>true<\/required>/.test(xml) || fieldType === 'MasterDetail';
    schemas[c.parentObject].fields.push({ label, apiName: c.name.split('.').pop(), type: fieldType, required });
  }
}
for (const objName of Object.keys(schemas)) {
  schemas[objName].relationships = edges
    .filter((e) => e.type === 'references_object' && (e.from === objName || e.to === objName))
    .map((e) => ({ name: e.from === objName ? e.to : e.from, direction: e.from === objName ? 'references' : 'referenced by' }));
}

// ---------- features (connected components of the dependency graph) ----------
const CLUSTERABLE_TYPES = new Set(['ApexClass', 'ApexTrigger', 'Flow', 'LightningComponentBundle', 'CustomObject']);
const clusterNodes = components.filter((c) => CLUSTERABLE_TYPES.has(c.type)).map((c) => c.name);
const adjacency = new Map(clusterNodes.map((n) => [n, new Set()]));
for (const e of edges) {
  if (adjacency.has(e.from) && adjacency.has(e.to)) {
    adjacency.get(e.from).add(e.to);
    adjacency.get(e.to).add(e.from);
  }
}
const visited = new Set();
const clusters = [];
for (const start of clusterNodes) {
  if (visited.has(start)) continue;
  const cluster = [];
  const queue = [start];
  visited.add(start);
  while (queue.length) {
    const cur = queue.shift();
    cluster.push(cur);
    for (const next of adjacency.get(cur) || []) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  clusters.push(cluster);
}

function titleForCluster(members) {
  const objectMembers = members.filter((n) => byName.get(n)?.type === 'CustomObject');
  if (!objectMembers.length) return null; // assigned a generic name below once we know the index
  // Prefer the most-connected object as the cluster's "primary" object (a parent object
  // usually has more edges than its child detail records).
  objectMembers.sort((a, b) => (adjacency.get(b)?.size || 0) - (adjacency.get(a)?.size || 0));
  const primary = objectMembers[0];
  return `${schemas[primary]?.label || primary} Management`;
}

const features = clusters
  .filter((cluster) => cluster.length > 1) // a single isolated component isn't really a "feature"
  .map((members, i) => {
    const apexMembers = members.filter((n) => byName.get(n)?.type === 'ApexClass' && !isTestClass.get(n));
    const coverages = apexMembers.map((n) => coverageFor(n)).filter((v) => v != null);
    const avgCoverage = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : null;
    return {
      slug: `feature-${i + 1}`,
      title: titleForCluster(members) || `Feature ${i + 1}`,
      members,
      memberCount: members.length,
      quality: qualityFromCoverage(avgCoverage) || 'Medium',
    };
  })
  .sort((a, b) => b.memberCount - a.memberCount);

// ---------- assemble component details ----------
const componentDetails = components.map((c) => {
  const coverage = coverageFor(c.name);
  const methods = (methodsByComponent.get(c.name) || []).map((m) => ({
    ...m,
    usedIn: (usedBy.get(c.name) || []).filter((e) => e.method === m.name).map((e) => ({ name: e.from, relationship: e.type })),
  }));
  return {
    name: c.name,
    type: c.type,
    path: c.path,
    owner: OWNER_BY_TYPE[c.type] || 'Platform Engineering',
    updated: gitLastModified(ROOT, c.source),
    isTestClass: !!isTestClass.get(c.name),
    coverage,
    health: healthFromCoverage(coverage),
    quality: qualityFromCoverage(coverage),
    securityFindings: c.type === 'ApexClass' ? securityFindingsFor(c.name) : [],
    methods,
    dependsOn: (dependsOn.get(c.name) || []).map((e) => ({ name: e.to, type: byName.get(e.to)?.type, relationship: e.type, confidence: e.confidence })),
    usedBy: (usedBy.get(c.name) || []).map((e) => ({ name: e.from, type: byName.get(e.from)?.type, relationship: e.type, confidence: e.confidence })),
    purpose: null,
  };
});

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
  schemas,
  features,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));
console.log(`docs/technical/data.json written — ${components.length} components, ${edges.length} edges, ${features.length} feature(s) (v${version})`);
