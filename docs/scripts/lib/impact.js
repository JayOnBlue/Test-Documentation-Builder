'use strict';
/**
 * Shared cross-reference used by both generate-changelog.js and
 * generate-version-history.js so a release/commit summary can say not just
 * "what changed" but "which type of component" and "which business Feature"
 * — derived from data extract-technical.js already computed, not invented.
 */
const fs = require('fs');

function loadTechData(techDataFile) {
  if (!fs.existsSync(techDataFile)) return { features: [], components: [] };
  try { return JSON.parse(fs.readFileSync(techDataFile, 'utf8')); }
  catch (e) { return { features: [], components: [] }; }
}

function loadFeatureMap(techDataFile) {
  const map = new Map();
  for (const feature of loadTechData(techDataFile).features || []) {
    for (const member of feature.members) map.set(member, feature.title);
  }
  return map;
}

function loadComponentTypes(techDataFile) {
  const map = new Map();
  for (const c of loadTechData(techDataFile).components || []) map.set(c.name, c.type);
  return map;
}

/**
 * grouped = { Added: [names], Changed: [names], Removed: [names] } (or any
 * action-keyed shape). Returns a plain-English technical summary and the list
 * of business Features touched — both derived, both worth showing together
 * since one says "what" and the other says "why it matters."
 */
function summarizeImpact(grouped, componentTypeByName, featureByComponent) {
  const technical = [];
  for (const [action, names] of Object.entries(grouped)) {
    if (!names || !names.length) continue;
    const byType = {};
    for (const n of names) {
      const t = componentTypeByName.get(n) || 'component';
      byType[t] = (byType[t] || 0) + 1;
    }
    const typeStr = Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ');
    technical.push(`${action} ${names.length} (${typeStr})`);
  }
  const allNames = Object.values(grouped).flat();
  const features = Array.from(new Set(allNames.map((n) => featureByComponent.get(n)).filter(Boolean)));
  const unmappedCount = allNames.filter((n) => !featureByComponent.has(n)).length;

  const technicalText = technical.length ? technical.join('; ') + '.' : 'No components changed.';
  const businessText = !allNames.length
    ? 'No business area affected.'
    : features.length
      ? `Likely affects: ${features.join(', ')}.`
      : 'No mapped business feature yet (not yet clustered into a Feature).';

  return { technicalText, businessText, features, unmappedCount };
}

module.exports = { loadFeatureMap, loadComponentTypes, summarizeImpact };
