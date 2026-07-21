#!/usr/bin/env node
/**
 * Unified static-site generator — Stripe-docs-style layout for the business/use-case
 * pages, adapted from client-business-docs-source-V2/build/build.js, plus a technical-docs
 * app bolted on as a second section of the SAME site.
 *
 *   docs/business/*.md   ----> docs/site/*.html            (business/use-case pages)
 *                               docs/site/raw/*.md
 *   docs/CHANGELOG.md    ----> docs/site/changelog.html     (parsed, not fetched from an API)
 *   docs/technical/data.json -> docs/site/technical/        (component wiki, dark theme)
 *
 * Everything under docs/site/ is what gets published to GitHub Pages.
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const config = require('./config');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'docs', 'business');
const SITE_DIR = path.join(ROOT, 'docs', 'site');
const ASSETS_DIR = path.join(__dirname, 'business-assets');
const TECH_ASSETS_DIR = path.join(__dirname, 'technical-assets');
const TECH_DATA_FILE = path.join(ROOT, 'docs', 'technical', 'data.json');
const CHANGELOG_FILE = path.join(ROOT, 'docs', 'CHANGELOG.md');

const CATEGORY_ORDER = { 'Getting Started': 0 };

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
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

// ---------- parse all business pages ----------
const files = walk(CONTENT_DIR);
const pages = files.map((full) => {
  const raw = fs.readFileSync(full, 'utf8');
  const relPath = path.relative(CONTENT_DIR, full);
  const { data, content } = matter(raw);
  const env = { headings: [] };
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
    prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
    order: typeof data.order === 'number' ? data.order : 999,
    slug, base,
    filename: `${base}.html`,
    rawFilename: `raw/${base}.md`,
    fullRaw: raw,
    bodyRaw: content,
    html,
    headings: env.headings,
    relPath, isLanding
  };
});

pages.sort((a, b) => {
  const ca = CATEGORY_ORDER[a.category] ?? 50;
  const cb = CATEGORY_ORDER[b.category] ?? 50;
  if (ca !== cb) return ca - cb;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.order - b.order;
});

const categoryNames = [];
for (const p of pages) if (!categoryNames.includes(p.category)) categoryNames.push(p.category);

function pagesInCategory(cat) { return pages.filter((p) => p.category === cat); }
function firstPageOfCategory(cat) { return pagesInCategory(cat)[0]; }

const searchIndex = pages.map((p) => ({ title: p.title, description: p.description, feature: p.feature, url: p.filename }))
  .concat([{ title: 'Changelog', description: 'What changed, generated from force-app metadata diffs', feature: 'Changelog', url: 'changelog.html' }]);

// ---------- shared chrome ----------
function renderTabNav(activeCategory) {
  const tabs = categoryNames.map((cat) => {
    const href = firstPageOfCategory(cat).filename;
    const active = cat === activeCategory;
    return `<a class="tabnav__link${active ? ' tabnav__link--active' : ''}" href="${href}">${esc(cat)}</a>`;
  }).join('');
  const changelogActive = activeCategory === '__changelog__';
  return `<nav class="tabnav" aria-label="Sections">${tabs}<a class="tabnav__link${changelogActive ? ' tabnav__link--active' : ''}" href="changelog.html">Changelog</a></nav>`;
}

function renderTopbar() {
  return `
  <header class="topbar">
    <div class="topbar__inner">
      <a class="topbar__logo" href="index.html">
        <span class="topbar__mark" aria-hidden="true"></span>
        ${esc(config.siteName)}
      </a>
      <button id="search-trigger" class="search-trigger" type="button">
        <span class="search-trigger__icon" aria-hidden="true">&#128269;</span>
        <span class="search-trigger__label">Search documentation...</span>
        <span class="search-trigger__kbd">/</span>
      </button>
      <div class="topbar__actions">
        <button id="export-trigger" class="topbar__btn" type="button">
          <span aria-hidden="true">&#11015;</span>
          <span>Download docs</span>
        </button>
        <a class="topbar__link" href="changelog.html">Changelog</a>
        <a class="topbar__link" href="technical/index.html">Technical Docs</a>
      </div>
    </div>
  </header>`;
}

function renderExportModal() {
  const opts = categoryNames.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  return `
  <div id="export-modal" class="modal" hidden>
    <div class="modal__backdrop" data-close-export></div>
    <div class="modal__panel export-panel" role="dialog" aria-modal="true" aria-label="Download documentation">
      <div class="export-panel__head">
        <h2 class="export-panel__title">Download documentation</h2>
        <button type="button" class="export-panel__close" data-close-export aria-label="Close">&times;</button>
      </div>
      <div class="export-panel__body">
        <label class="export-field">
          <span class="export-field__label">Which documentation?</span>
          <select id="export-category" class="export-select">
            <option value="__all__">All documentation (${pages.length} pages)</option>
            ${opts}
          </select>
        </label>
        <div class="export-field">
          <span class="export-field__label">Format</span>
          <label class="export-radio"><input type="radio" name="export-format" value="pdf" checked> <span><strong>PDF</strong> — opens a print view; choose "Save as PDF"</span></label>
          <label class="export-radio"><input type="radio" name="export-format" value="doc"> <span><strong>Word document (.doc)</strong> — downloads a Word-openable file</span></label>
        </div>
      </div>
      <div class="export-panel__foot">
        <button type="button" class="btn-secondary" data-close-export>Cancel</button>
        <button type="button" class="btn-primary" id="export-run">Download</button>
      </div>
    </div>
  </div>`;
}

function renderSearchModal() {
  return `
  <div id="search-modal" class="search-modal" hidden>
    <div class="search-modal__backdrop" data-close-search></div>
    <div class="search-modal__panel" role="dialog" aria-modal="true" aria-label="Search documentation">
      <div class="search-modal__input-row">
        <span class="search-trigger__icon" aria-hidden="true">&#128269;</span>
        <input id="search-input" type="text" placeholder="Search documentation..." autocomplete="off">
        <span class="search-modal__esc">ESC</span>
      </div>
      <div id="search-results" class="search-results search-results--modal"></div>
    </div>
  </div>`;
}

function renderSidebar(activeCategory, currentFilename) {
  return categoryNames.map((cat) => {
    const items = pagesInCategory(cat);
    const open = cat === activeCategory ? ' open' : '';
    return `<details class="nav-group"${open}>
      <summary class="nav-group__label"><span class="nav-group__chevron" aria-hidden="true"></span>${esc(cat)}</summary>
      <ul class="nav-group__items">
        ${items.map((p) => `<li><a class="nav-link${p.filename === currentFilename ? ' nav-link--active' : ''}" href="${p.filename}">${esc(p.feature)}</a></li>`).join('')}
      </ul>
    </details>`;
  }).join('');
}

function renderTOC(headings) {
  if (!headings.length) return '';
  return `
    <nav class="toc" aria-label="On this page">
      <div class="toc__label">On this page</div>
      <ul class="toc__list">
        ${headings.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}
      </ul>
    </nav>`;
}

function renderPrereqCallout(page) {
  if (!page.prerequisites.length) return '';
  return `
    <div class="callout callout--info">
      <div class="callout__title">Before you start</div>
      <ul>${page.prerequisites.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </div>`;
}

function renderActionBar() {
  const actions = [
    ['copy-llm', '&#10024;', 'Copy for LLM'],
    ['view-md', '&#128196;', 'View as Markdown'],
    ['copy-url-md', '&#128279;', 'Copy URL to Markdown'],
    ['download-pdf', '&#11015;', 'Download PDF']
  ];
  return `
    <div class="action-bar" data-action-bar>
      ${actions.map(([action, icon, label]) => `<button type="button" class="action-bar__item" data-action="${action}"><span aria-hidden="true">${icon}</span>${label}</button>`).join('')}
    </div>`;
}

function renderPrevNext(page) {
  const items = pagesInCategory(page.category);
  const i = items.findIndex((p) => p.filename === page.filename);
  const prev = items[i - 1];
  const next = items[i + 1];
  if (!prev && !next) return '';
  return `
    <div class="page-nav">
      ${prev ? `<a class="page-nav__link page-nav__link--prev" href="${prev.filename}"><span class="page-nav__dir">Previous</span><span class="page-nav__title">${esc(prev.feature)}</span></a>` : '<span></span>'}
      ${next ? `<a class="page-nav__link page-nav__link--next" href="${next.filename}"><span class="page-nav__dir">Next</span><span class="page-nav__title">${esc(next.feature)}</span></a>` : ''}
    </div>`;
}

function renderHomeCards() {
  const cards = categoryNames.filter((c) => c !== 'Getting Started').map((cat) => {
    const first = firstPageOfCategory(cat);
    const count = pagesInCategory(cat).length;
    return `<a class="home-card" href="${first.filename}">
      <span class="home-card__title">${esc(cat)}</span>
      <span class="home-card__count">${count} ${count === 1 ? 'page' : 'pages'}</span>
    </a>`;
  }).join('');
  return `<h2 id="browse-by-area">Browse by area</h2>
    <div class="home-cards">${cards}</div>`;
}

function htmlHead(title, description) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">`;
}

function renderPage(page) {
  const rawDataJson = JSON.stringify({ title: page.title, url: page.filename, rawUrl: page.rawFilename, markdown: page.bodyRaw });

  return `<!DOCTYPE html>
<html lang="en">
<head>
${htmlHead(page.isLanding ? page.title : `${page.title} · ${config.siteName}`, page.description)}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${renderTopbar()}
  ${renderSearchModal()}
  ${renderExportModal()}

  <div class="layout">
    <aside class="sidebar">
      <nav aria-label="Documentation">${renderSidebar(page.category, page.filename)}</nav>
    </aside>

    <main id="main" class="content">
      <div class="content__inner">
        <div class="breadcrumbs">
          <a href="index.html">Docs</a>
          <span class="breadcrumbs__sep">/</span>
          <span>${esc(page.category)}</span>
          <span class="breadcrumbs__sep">/</span>
          <span class="breadcrumbs__current">${esc(page.feature)}</span>
        </div>

        <h1 class="page-title">${esc(page.title)}</h1>
        ${page.description ? `<p class="page-lede">${esc(page.description)}</p>` : ''}
        ${renderActionBar()}

        ${renderPrereqCallout(page)}

        <article class="prose">${page.html}${page.isLanding ? renderHomeCards() : ''}</article>

        ${renderPrevNext(page)}
      </div>
    </main>

    <aside class="toc-rail">${renderTOC(page.headings)}</aside>
  </div>

  <script>window.__SEARCH_INDEX__ = ${JSON.stringify(searchIndex)};</script>
  <script id="raw-md-data" type="application/json">${rawDataJson}</script>
  <script src="export-data.js"></script>
  <script src="app.js"></script>
</body>
</html>`;
}

function renderRawView(page) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${htmlHead(`${page.title} · Markdown source`, page.description)}
</head>
<body class="raw-view">
  <header class="raw-view__bar">
    <a href="../${page.filename}">&larr; Back to ${esc(page.title)}</a>
    <button type="button" id="raw-copy-btn" class="raw-view__copy">Copy</button>
  </header>
  <pre class="raw-view__pre"><code>${esc(page.fullRaw)}</code></pre>
  <script>
    document.getElementById('raw-copy-btn').addEventListener('click', function () {
      navigator.clipboard.writeText(document.querySelector('.raw-view__pre code').textContent).then(function () {
        var b = document.getElementById('raw-copy-btn');
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = 'Copy'; }, 1500);
      });
    });
  </script>
</body>
</html>`;
}

// ---------- changelog (parsed from docs/CHANGELOG.md, not fetched from anywhere) ----------
function parseChangelog(md_text) {
  const lines = md_text.split('\n');
  const entries = [];
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      if (current) entries.push(current);
      current = { heading: h2[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function renderChangelogPage() {
  const raw = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, 'utf8') : '';
  const entries = parseChangelog(raw);

  const sidebarEntries = entries.map((e) => `<li><a class="nav-link" href="#${slugify(e.heading)}">${esc(e.heading)}</a></li>`).join('');

  const body = entries.length === 0
    ? `<div class="callout callout--info">
         <div class="callout__title">No changelog entries yet</div>
         <p>Run <code>node docs/scripts/generate-changelog.js</code> after a force-app change to add the first entry.</p>
       </div>`
    : entries.map((e) => `
        <section class="changelog-entry" id="${slugify(e.heading)}">
          <div class="changelog-entry__header">
            <h2 class="changelog-entry__version">${esc(e.heading)}</h2>
          </div>
          <div class="prose changelog-entry__body">${md.render(e.body.join('\n'))}</div>
        </section>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${htmlHead(`Changelog · ${config.siteName}`, 'What changed, generated from force-app metadata diffs on every push to main')}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${renderTopbar()}
  ${renderSearchModal()}
  ${renderExportModal()}

  <div class="layout">
    <aside class="sidebar">
      <nav aria-label="Documentation">
        ${renderSidebar(null, null)}
        <div class="nav-group nav-group--static">
          <div class="nav-group__label">On this changelog</div>
          <ul class="nav-group__items">${sidebarEntries || '<li class="nav-link" style="opacity:.6">No entries yet</li>'}</ul>
        </div>
      </nav>
    </aside>

    <main id="main" class="content">
      <div class="content__inner">
        <div class="breadcrumbs">
          <a href="index.html">Docs</a>
          <span class="breadcrumbs__sep">/</span>
          <span class="breadcrumbs__current">Changelog</span>
        </div>
        <h1 class="page-title">Changelog</h1>
        <p class="page-lede">Generated automatically from what changed in <code>force-app/</code> — not hand-written.</p>
        ${body}
      </div>
    </main>

    <aside class="toc-rail"></aside>
  </div>

  <script>window.__SEARCH_INDEX__ = ${JSON.stringify(searchIndex)};</script>
  <script src="export-data.js"></script>
  <script src="app.js"></script>
</body>
</html>`;
}

// ---------- write output ----------
function build() {
  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.mkdirSync(path.join(SITE_DIR, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(SITE_DIR, 'technical'), { recursive: true });

  pages.forEach((page) => {
    fs.writeFileSync(path.join(SITE_DIR, page.filename), renderPage(page), 'utf8');
    fs.writeFileSync(path.join(SITE_DIR, page.rawFilename), page.fullRaw, 'utf8');
    fs.writeFileSync(path.join(SITE_DIR, `raw/${page.base}.html`), renderRawView(page), 'utf8');
  });

  fs.copyFileSync(path.join(ASSETS_DIR, 'styles.css'), path.join(SITE_DIR, 'styles.css'));
  fs.copyFileSync(path.join(ASSETS_DIR, 'app.js'), path.join(SITE_DIR, 'app.js'));

  // data bundle for the "Download docs" (PDF / Word) feature — embedded so it works offline
  const exportData = {
    siteName: config.siteName,
    categories: categoryNames,
    pages: pages.map((p) => ({ filename: p.filename, title: p.title, feature: p.feature, category: p.category, description: p.description, html: p.html }))
  };
  fs.writeFileSync(path.join(SITE_DIR, 'export-data.js'), 'window.__DOCS_EXPORT__ = ' + JSON.stringify(exportData) + ';', 'utf8');

  fs.writeFileSync(path.join(SITE_DIR, 'changelog.html'), renderChangelogPage(), 'utf8');

  // technical-docs section — its own small dark-themed app, fed by docs/technical/data.json
  const techIndexHtml = fs.readFileSync(path.join(TECH_ASSETS_DIR, 'index.html'), 'utf8').replace(/\{\{SITE_NAME\}\}/g, config.siteName);
  fs.writeFileSync(path.join(SITE_DIR, 'technical', 'index.html'), techIndexHtml, 'utf8');
  fs.copyFileSync(path.join(TECH_ASSETS_DIR, 'app.js'), path.join(SITE_DIR, 'technical', 'app.js'));
  fs.copyFileSync(path.join(TECH_ASSETS_DIR, 'styles.css'), path.join(SITE_DIR, 'technical', 'styles.css'));
  const techDataRaw = fs.existsSync(TECH_DATA_FILE) ? fs.readFileSync(TECH_DATA_FILE, 'utf8') : '{"components":[],"componentsByType":{},"edgesByRelationship":{}}';
  fs.writeFileSync(path.join(SITE_DIR, 'technical', 'data.js'), `window.__TECH_DATA__ = ${techDataRaw};`, 'utf8');

  console.log(`Built ${pages.length} business page(s) + technical wiki -> ${SITE_DIR}`);
}

build();
