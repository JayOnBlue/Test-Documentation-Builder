#!/usr/bin/env node
/**
 * Unified static-site generator. One shell (site-assets/index.html + app.js +
 * styles.css), one data bundle (docs/site/data.js), covering business docs,
 * technical reference, changelog, and version history as client-side routes
 * (hash-based, so the whole thing works from a plain GitHub Pages deploy with
 * no server and no build-time page explosion).
 *
 *   docs/business/*.md        --\
 *   docs/technical/data.json    |--> docs/site/data.js (window.__SITE_DATA__)
 *   docs/technical/versions.json|
 *   docs/CHANGELOG.md          --/
 *   docs/scripts/site-assets/* ----> docs/site/{index.html,app.js,styles.css}
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const yaml = require('js-yaml');
const hljs = require('highlight.js');
const config = require('./config');
const { gitLastModified, readTimeMinutes } = require('./lib/util');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'docs', 'business');
const SITE_DIR = path.join(ROOT, 'docs', 'site');
const ASSETS_DIR = path.join(__dirname, 'site-assets');
const TECH_DATA_FILE = path.join(ROOT, 'docs', 'technical', 'data.json');
const VERSIONS_FILE = path.join(ROOT, 'docs', 'technical', 'versions.json');
const CHANGELOG_FILE = path.join(ROOT, 'docs', 'CHANGELOG.md');
const IMAGES_DIR = path.join(ROOT, 'docs', 'images');
const SCREENSHOT_MANIFEST_FILE = path.join(ROOT, 'docs', 'screenshot-manifest.json');
const screenshotManifest = [];

const CATEGORY_ORDER = { 'Getting Started': 0 };
const CALLOUT_LABELS = { before: 'Before you start', note: 'Note', tip: 'Tip', warning: 'Warning', deprecated: 'Deprecated', placeholder: 'Placeholder' };

function slugify(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name.endsWith('.md') && entry.name !== 'TEMPLATE.md') out.push(full);
  }
  return out;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value; } catch (e) { /* fall through */ }
    }
    return md.utils.escapeHtml(str);
  }
});

md.renderer.rules.heading_open = function (tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const level = Number(token.tag.slice(1));
  const inline = tokens[idx + 1];
  const text = inline && inline.type === 'inline' ? inline.content : '';
  const id = slugify(text);
  token.attrSet('id', id);
  if (level === 2 && env.headings) env.headings.push({ text, id });
  return slf.renderToken(tokens, idx, options);
};

const defaultFence = md.renderer.rules.fence
  ? md.renderer.rules.fence.bind(md.renderer.rules)
  : function (tokens, idx, options, env, slf) { return slf.renderToken(tokens, idx, options); };

md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const token = tokens[idx];
  const lang = token.info.trim();
  if (lang === 'screenshot') return renderScreenshot(token, idx, env);
  if (lang !== 'callout') return defaultFence(tokens, idx, options, env, slf);

  const lines = token.content.split('\n');
  const typeLine = lines[0] || '';
  const typeMatch = typeLine.match(/^type:\s*(\w+)/);
  const type = typeMatch ? typeMatch[1] : 'note';
  const bodyMd = lines.slice(typeMatch ? 1 : 0).join('\n');
  const bodyHtml = md.render(bodyMd, {});
  const label = CALLOUT_LABELS[type] || 'Note';
  return `<div class="callout callout--${type}"><span class="callout__label">${esc(label)}</span>${bodyHtml}</div>`;
};

// Renders a ```screenshot block as a real <img> if docs/images/<id>.{png,jpg} exists,
// otherwise a "Screenshot pending" placeholder — and records the block in the
// screenshot-manifest.json that the robot-capture workflow reads to know what to shoot.
function renderScreenshot(token, idx, env) {
  let data = {};
  try { data = yaml.load(token.content) || {}; } catch (e) { data = {}; }
  const id = data.id || `screenshot-${idx}`;
  const alt = esc(data.alt || '');
  const step = data.step || '';
  const urlPattern = data.url_pattern || '';

  screenshotManifest.push({ id, alt: data.alt || '', step, url_pattern: urlPattern, source: env.relPath });

  let imgFile = null;
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    if (fs.existsSync(path.join(IMAGES_DIR, id + ext))) { imgFile = id + ext; break; }
  }

  if (imgFile) {
    return `<figure class="screenshot"><img src="images/${imgFile}" alt="${alt}" loading="lazy"></figure>`;
  }
  return `<figure class="screenshot screenshot--pending" data-screenshot-id="${id}">
    <div class="screenshot__placeholder">
      <span class="screenshot__icon" aria-hidden="true">&#128247;</span>
      <div class="screenshot__meta">
        <span class="screenshot__badge">Screenshot pending</span>
        <p class="screenshot__alt">${alt}</p>
        ${step ? `<p class="screenshot__step"><strong>Capture:</strong> ${esc(step)}</p>` : ''}
      </div>
    </div>
  </figure>`;
}

// ---------- parse all business pages ----------
const files = walk(CONTENT_DIR);
const rawPages = files.map((full) => {
  const raw = fs.readFileSync(full, 'utf8');
  const relPath = path.relative(CONTENT_DIR, full);
  const { data, content } = matter(raw);
  const env = { headings: [], relPath };
  const html = md.render(content, env);

  const category = data.category || 'General';
  const slug = data.slug || slugify(path.basename(full, '.md'));
  const isLanding = category === 'Getting Started' && slug === 'overview';
  const base = isLanding ? 'index' : `${slugify(category)}--${slug}`;

  return {
    title: data.title || data.feature || slug,
    feature: data.feature || data.title || slug,
    category,
    description: data.description || '',
    owner: data.owner || 'Unassigned',
    verified: data.verified !== false,
    deprecated: !!data.deprecated,
    replacementSlug: data.replacement || null,
    prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
    relatedSlugs: Array.isArray(data.related) ? data.related : [],
    order: typeof data.order === 'number' ? data.order : 999,
    slug, base,
    filename: `${base}.html`,
    updated: gitLastModified(ROOT, full),
    readTime: readTimeMinutes(content),
    fullRaw: raw,
    rawMarkdown: content,
    html,
    headings: env.headings,
    relPath, isLanding
  };
});

rawPages.sort((a, b) => {
  const ca = CATEGORY_ORDER[a.category] ?? 50;
  const cb = CATEGORY_ORDER[b.category] ?? 50;
  if (ca !== cb) return ca - cb;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.order - b.order;
});

const bySlug = new Map(rawPages.map((p) => [p.slug, p]));
function resolveRef(slug) {
  const p = bySlug.get(slug);
  return p ? { slug: p.slug, category: p.category, title: p.feature } : null;
}
const pages = rawPages.map((p) => ({
  ...p,
  related: p.relatedSlugs.map(resolveRef).filter(Boolean),
  replacement: p.deprecated ? resolveRef(p.replacementSlug) : null,
}));

const categoryNames = [];
for (const p of pages) if (!categoryNames.includes(p.category)) categoryNames.push(p.category);

// ---------- changelog: parse docs/CHANGELOG.md into structured releases ----------
function parseChangelog(text) {
  const blocks = text.split(/\n(?=## v)/).filter((b) => b.trim().startsWith('## v'));
  return blocks.map((block) => {
    const headerMatch = block.match(/^## (v\d+) — ([\d-]+)(?: — (\w+))?/);
    const version = headerMatch ? headerMatch[1] : 'v0';
    const date = headerMatch ? headerMatch[2] : '';
    const hash = headerMatch ? headerMatch[3] || '' : '';
    const contributorsMatch = block.match(/\*\*Contributors:\*\* (.+)/);
    const contributors = contributorsMatch ? contributorsMatch[1].split(',').map((s) => s.trim()) : [];
    const compareMatch = block.match(/\*\*Compare:\*\* \[([^\]]+)\]\(([^)]+)\)/);
    const compareRange = compareMatch ? compareMatch[1] : null;
    const compareUrl = compareMatch ? compareMatch[2] : null;
    const technicalSummary = (block.match(/\*\*Technical summary:\*\* (.+)/) || [])[1] || '';
    const businessSummary = (block.match(/\*\*Business summary:\*\* (.+)/) || [])[1] || '';
    const businessFeaturesRaw = (block.match(/\*\*Business features:\*\* (.+)/) || [])[1] || '';
    const businessFeatures = businessFeaturesRaw ? businessFeaturesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const groups = { Added: [], Changed: [], Removed: [] };
    const groupBlocks = block.split(/\n(?=### )/);
    for (const gb of groupBlocks) {
      const gm = gb.match(/^### (Added|Changed|Removed)/);
      if (!gm) continue;
      const itemRe = /- \*\*(\w+)\*\* `([^`]+)`/g;
      let im;
      while ((im = itemRe.exec(gb))) groups[gm[1]].push({ type: im[1], name: im[2] });
    }
    return { version, date, hash, contributors, compareUrl, compareRange, technicalSummary, businessSummary, businessFeatures, groups };
  });
}
const changelogText = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, 'utf8') : '';
const releases = parseChangelog(changelogText);

// ---------- technical data + version history (already generated JSON) ----------
const technical = fs.existsSync(TECH_DATA_FILE)
  ? JSON.parse(fs.readFileSync(TECH_DATA_FILE, 'utf8'))
  : { components: [], componentsByType: {}, edgesByRelationship: {}, schemas: {}, features: [], componentCount: 0, edgeCount: 0 };
const versionsData = fs.existsSync(VERSIONS_FILE)
  ? JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'))
  : { versions: [] };

// ---------- assemble the single data bundle ----------
const siteData = {
  siteName: config.siteName,
  generatedAt: new Date().toISOString(),
  business: {
    categories: categoryNames,
    pages: pages.map((p) => ({
      slug: p.slug, base: p.base, title: p.title, feature: p.feature, category: p.category,
      description: p.description, owner: p.owner, verified: p.verified, deprecated: p.deprecated,
      replacement: p.replacement, updated: p.updated, readTime: p.readTime, prerequisites: p.prerequisites,
      related: p.related, order: p.order, isLanding: p.isLanding, html: p.html, headings: p.headings,
      rawMarkdown: p.rawMarkdown,
    })),
  },
  glossary: config.glossary,
  roleCategories: config.roleCategories,
  changelog: { releases },
  technical,
  versions: versionsData,
};

// ---------- write output ----------
function build() {
  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.mkdirSync(path.join(SITE_DIR, 'raw'), { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const p of pages) fs.writeFileSync(path.join(SITE_DIR, 'raw', `${p.base}.md`), p.fullRaw, 'utf8');

  const indexHtml = fs.readFileSync(path.join(ASSETS_DIR, 'index.html'), 'utf8').replace(/\{\{SITE_NAME\}\}/g, config.siteName);
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexHtml, 'utf8');
  fs.copyFileSync(path.join(ASSETS_DIR, 'app.js'), path.join(SITE_DIR, 'app.js'));
  fs.copyFileSync(path.join(ASSETS_DIR, 'styles.css'), path.join(SITE_DIR, 'styles.css'));
  fs.writeFileSync(path.join(SITE_DIR, 'data.js'), `window.__SITE_DATA__ = ${JSON.stringify(siteData)};`, 'utf8');

  fs.writeFileSync(SCREENSHOT_MANIFEST_FILE, JSON.stringify(screenshotManifest, null, 2), 'utf8');

  console.log(`Built ${pages.length} business page(s), ${technical.components.length} technical component(s), ${releases.length} changelog release(s), ${versionsData.versions.length} version(s) -> ${SITE_DIR}`);
  console.log(`Screenshot manifest: ${screenshotManifest.length} placeholder(s) -> docs/screenshot-manifest.json`);
}

build();
