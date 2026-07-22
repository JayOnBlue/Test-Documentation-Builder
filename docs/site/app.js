(function () {
  'use strict';
  var DATA = window.__SITE_DATA__ || {};
  var business = DATA.business || { categories: [], pages: [] };
  var glossary = DATA.glossary || [];
  var roleCategories = DATA.roleCategories || {};
  var changelog = DATA.changelog || { releases: [] };
  var tech = DATA.technical || { components: [], componentsByType: {}, edgesByRelationship: {}, schemas: {}, features: [] };
  var versions = (DATA.versions && DATA.versions.versions) || [];

  var byComponentName = {};
  tech.components.forEach(function (c) { byComponentName[c.name] = c; });
  var byPageSlug = {};
  business.pages.forEach(function (p) { byPageSlug[p.slug] = p; });

  // ---------------- helpers ----------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function slugify(s) {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmtDate(iso) {
    if (!iso) return 'unknown date';
    try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return iso; }
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var days = Math.floor(diff / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return days + ' days ago';
    var months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : months + ' months ago';
  }
  function coverageColor(cov) {
    if (cov == null) return 'var(--health-na)';
    if (cov >= 75) return 'var(--health-good)';
    if (cov >= 50) return 'var(--health-warn)';
    return '#ef4444';
  }
  function confidenceClass(conf) {
    if (conf === 'High') return 'badge-confidence badge-confidence--high';
    if (conf === 'Medium') return 'badge-confidence badge-confidence--medium';
    return 'badge-confidence badge-confidence--low';
  }
  function localGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function localSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable — non-fatal */ }
  }
  var AVATAR_PALETTE = ['#0284c7', '#0891b2', '#0d9488', '#2563eb', '#0369a1', '#0e7490', '#155e75', '#1d4ed8'];
  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function colorFor(name) { return AVATAR_PALETTE[hashString(name || '?') % AVATAR_PALETTE.length]; }
  function initialsOf(name) {
    var parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  var CATEGORY_PALETTE = ['#0284c7', '#0d9488', '#0891b2', '#2563eb', '#0369a1', '#1d4ed8', '#64748b', '#0e7490'];
  function categoryColor(cat) { return CATEGORY_PALETTE[hashString(cat) % CATEGORY_PALETTE.length]; }
  function categoryLetter(cat) { return String(cat).trim()[0].toUpperCase(); }

  // ---------------- state ----------------
  var state = {
    role: localGet('qe360:role', 'all'),
    sidebarCollapsed: {},     // business category -> bool (collapsed)
    sectionCollapsed: {},     // "pageSlug::headingId" -> bool
    methodExpanded: {},       // "className::methodName" -> bool
    impactOpen: {},           // className -> bool
    indexFilter: '',
    healthFilter: 'all',
    indexSort: 'name',
    treeOpen: {},
    downloadModalOpen: false,
    downloadScope: '__all__',
    downloadFormat: 'pdf',
  };

  // ================================================================
  // ROUTER
  // ================================================================
  function currentRoute() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean);
    if (!parts.length) return { name: 'overview' };
    if (parts[0] === 'docs' && parts[1] && parts[2]) return { name: 'article', section: parts[1], page: parts[2] };
    if (parts[0] === 'changelog') return { name: 'changelog' };
    if (parts[0] === 'tech') {
      if (!parts[1]) return { name: 'tech-overview' };
      if (parts[1] === 'index') return { name: 'tech-index' };
      if (parts[1] === 'features' && parts[2]) return { name: 'tech-feature-detail', target: decodeURIComponent(parts[2]) };
      if (parts[1] === 'features') return { name: 'tech-features' };
      if (parts[1] === 'versions') return { name: 'tech-versions' };
      if (parts[1] === 'class' && parts[2]) return { name: 'tech-class', target: decodeURIComponent(parts[2]) };
      if (parts[1] === 'object' && parts[2]) return { name: 'tech-object', target: decodeURIComponent(parts[2]) };
      if (parts[1] === 'component' && parts[2]) return { name: 'tech-component', target: decodeURIComponent(parts[2]) };
      return { name: 'tech-overview' };
    }
    return { name: 'overview' };
  }
  function isTechRoute(route) { return route.name.indexOf('tech') === 0; }

  function componentRouteHref(name) {
    var c = byComponentName[name];
    if (!c) return '#/tech/index';
    if (c.type === 'ApexClass') return '#/tech/class/' + encodeURIComponent(name);
    if (c.type === 'CustomObject') return '#/tech/object/' + encodeURIComponent(name);
    return '#/tech/component/' + encodeURIComponent(name);
  }

  // ================================================================
  // SHELL: sidebar, topbar, TOC, progress, back-to-top
  // ================================================================
  function visibleCategories() {
    if (state.role === 'all') return business.categories;
    var keep = (roleCategories[state.role] || []).concat(['Getting Started']);
    return business.categories.filter(function (c) { return keep.indexOf(c) !== -1; });
  }

  function renderSidebarBusiness(route) {
    var activeSlug = route.name === 'article' ? route.page : (route.name === 'overview' ? business.pages.find(function (p) { return p.isLanding; }).slug : null);
    var cats = visibleCategories();
    var banner = state.role !== 'all'
      ? '<div class="role-banner">Viewing as: ' + esc(state.role) + '<button type="button" id="clear-role">&times;</button></div>'
      : '';
    var html = cats.map(function (cat) {
      var pages = business.pages.filter(function (p) { return p.category === cat; }).sort(function (a, b) { return a.order - b.order; });
      var collapsed = state.sidebarCollapsed[cat] ? ' is-collapsed' : '';
      var caret = state.sidebarCollapsed[cat] ? '&#9656;' : '&#9662;';
      return '<div class="nav-group">' +
        '<div class="nav-group__label" data-toggle-cat="' + esc(cat) + '"><span><span class="nav-group__caret">' + caret + '</span>' + esc(cat) + '</span><span class="nav-group__count">' + pages.length + '</span></div>' +
        '<ul class="nav-group__items' + collapsed + '">' +
        pages.map(function (p) {
          var active = p.slug === activeSlug ? ' is-active' : '';
          return '<li><a class="nav-link' + active + '" href="#/docs/' + slugify(p.category) + '/' + p.slug + '">' + esc(p.feature) + '</a></li>';
        }).join('') + '</ul></div>';
    }).join('');
    qs('#sidebar').innerHTML = banner + html;
    var clearBtn = qs('#clear-role');
    if (clearBtn) clearBtn.addEventListener('click', function () { setRole('all'); });
    qsa('[data-toggle-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        var cat = el.getAttribute('data-toggle-cat');
        state.sidebarCollapsed[cat] = !state.sidebarCollapsed[cat];
        renderSidebarBusiness(currentRoute());
      });
    });
  }

  function buildTree() {
    var root = { children: {} };
    tech.components.forEach(function (c) {
      var parts = c.path.split('/');
      parts.pop();
      var node = root;
      parts.forEach(function (part) {
        node.children[part] = node.children[part] || { children: {}, count: 0 };
        node = node.children[part];
        node.count++;
      });
      node.items = node.items || [];
      node.items.push(c);
    });
    return root;
  }
  function renderTreeNode(node, activeName) {
    var html = '';
    Object.keys(node.children || {}).sort().forEach(function (name) {
      var child = node.children[name];
      var key = name;
      var open = state.treeOpen[key] !== false; // default open
      html += '<details class="tree__folder"' + (open ? ' open' : '') + ' data-tree-key="' + esc(key) + '">' +
        '<summary>&#128193; ' + esc(name) + ' (' + child.count + ')</summary>' +
        '<div class="tree__children">' + renderTreeNode(child, activeName) + '</div></details>';
    });
    (node.items || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
      var active = c.name === activeName ? ' is-active' : '';
      html += '<a class="tree__item' + active + '" href="' + componentRouteHref(c.name) + '"><span class="dot dot--' +
        (c.health === 'good' ? 'good' : c.health === 'warn' ? 'warn' : 'na') + '"></span>' + esc(c.name) + '</a>';
    });
    return html;
  }

  function renderSidebarTech(route) {
    var activeName = route.target || null;
    var navItems = [
      ['tech-overview', '#/tech', '&#9673;', 'Technical Overview'],
      ['tech-index', '#/tech/index', '&#9776;', 'Component Index'],
      ['tech-features', '#/tech/features', '&#10022;', 'Features'],
      ['tech-versions', '#/tech/versions', '&#128340;', 'Version History'],
    ];
    var effectiveRoute = route.name === 'tech-feature-detail' ? 'tech-features' : route.name;
    var nav = navItems.map(function (item) {
      var active = effectiveRoute === item[0] ? ' is-active' : '';
      return '<a class="' + active.trim() + '" href="' + item[1] + '"><span class="tech-nav__icon">' + item[2] + '</span>' + item[3] + '</a>';
    }).join('');
    var tree = buildTree();
    qs('#sidebar').innerHTML =
      '<a class="sidebar__back" href="#/">&larr; Back to business docs</a>' +
      '<nav class="tech-nav">' + nav + '</nav>' +
      '<div class="source-tree-label">Source tree</div>' +
      '<div class="tree--path">&#128193; force-app / main / default</div>' +
      '<div class="tree tree--nested">' + renderTreeNode(tree, activeName) + '</div>';
    qsa('.tree__folder', qs('#sidebar')).forEach(function (el) {
      el.addEventListener('toggle', function () { state.treeOpen[el.getAttribute('data-tree-key')] = el.open; });
    });
  }

  function renderSidebar(route) {
    if (isTechRoute(route)) renderSidebarTech(route);
    else renderSidebarBusiness(route);
  }

  function renderTopbarState(route) {
    qs('#btn-changelog').classList.toggle('is-active', route.name === 'changelog');
    qs('#btn-tech').classList.toggle('is-active', isTechRoute(route));
  }

  function buildTOC(headings) {
    var rail = qs('#toc-rail');
    if (!headings || !headings.length) { rail.innerHTML = ''; return; }
    rail.innerHTML = '<div class="toc__label">On this page</div><ul class="toc__list">' +
      headings.map(function (h) { return '<li><a href="#' + h.id + '" data-toc="' + h.id + '">' + esc(h.text) + '</a></li>'; }).join('') + '</ul>';
    qsa('a', rail).forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(a.getAttribute('data-toc'));
        if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function setupScrollSpy() {
    var links = qsa('#toc-rail a');
    if (!links.length) return;
    var headingEls = links.map(function (a) { return document.getElementById(a.getAttribute('data-toc')); }).filter(Boolean);
    function onScroll() {
      var activeId = null;
      headingEls.forEach(function (h) { if (h.getBoundingClientRect().top < 120) activeId = h.id; });
      links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('data-toc') === activeId); });
      var main = qs('#main');
      var pct = main.scrollHeight <= window.innerHeight ? 0 : (window.scrollY / (main.scrollHeight - window.innerHeight));
      qs('#progress-bar').style.width = Math.min(100, Math.max(0, pct * 100)) + '%';
      qs('#back-to-top').classList.toggle('is-visible', pct > 0.12);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  qs('#back-to-top').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  // ================================================================
  // BUSINESS PAGES
  // ================================================================
  function verifiedPill(page) {
    return page.verified
      ? '<span class="pill pill--good">&#10003; Verified</span>'
      : '<span class="pill pill--warn">&#9998; Auto-generated</span>';
  }

  function metaRow(page) {
    return '<div class="meta-row">Updated ' + fmtDate(page.updated) + ' <span class="sep">&middot;</span> Owner: ' + esc(page.owner || 'Unassigned') +
      ' <span class="sep">&middot;</span> ' + page.readTime + ' min read <span class="sep">&middot;</span> ' + verifiedPill(page) + '</div>';
  }

  function toolbar(page) {
    return '<div class="toolbar">' +
      '<button data-action="copy-llm">&#10024; Copy for LLM</button>' +
      '<button data-action="view-md">&#128196; View as Markdown</button>' +
      '<button data-action="download-page">&#8681; Download this page</button>' +
      '</div>';
  }

  function wireToolbar(page) {
    var btnLlm = qs('[data-action="copy-llm"]');
    if (btnLlm) btnLlm.addEventListener('click', function () {
      var text = '# ' + page.title + '\n\nSource: ' + location.href + '\n\n' + page.rawMarkdown;
      navigator.clipboard.writeText(text);
      flashButton(btnLlm, 'Copied');
    });
    var btnView = qs('[data-action="view-md"]');
    if (btnView) btnView.addEventListener('click', function () { window.open('raw/' + page.base + '.md', '_blank'); });
    var btnDl = qs('[data-action="download-page"]');
    if (btnDl) btnDl.addEventListener('click', function () { openDownloadModal(page.category); });
  }
  function flashButton(btn, text) {
    var old = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  function wireCollapsibleSections(page) {
    qsa('.prose h2').forEach(function (h2) {
      var body = document.createElement('div');
      body.className = 'h2-body';
      var next = h2.nextSibling;
      var nodes = [];
      while (next && !(next.nodeType === 1 && next.tagName === 'H2')) {
        var toMove = next;
        next = next.nextSibling;
        nodes.push(toMove);
      }
      nodes.forEach(function (n) { body.appendChild(n); });
      h2.parentNode.insertBefore(body, h2.nextSibling);
      var key = page.slug + '::' + h2.id;
      var collapsed = !!state.sectionCollapsed[key];
      h2.classList.toggle('is-collapsed', collapsed);
      body.classList.toggle('is-collapsed', collapsed);
      h2.innerHTML = '<span class="caret">&#9662;</span>' + h2.innerHTML;
      h2.addEventListener('click', function () {
        state.sectionCollapsed[key] = !state.sectionCollapsed[key];
        h2.classList.toggle('is-collapsed');
        body.classList.toggle('is-collapsed');
      });
    });
  }

  var ROLE_ICONS = { all: '&#9432;', sales: '$', operations: '&#9881;', developer: '{ }' };
  function renderRoleAndGlossaryAndCards() {
    var roles = [['all', 'Everyone'], ['sales', 'Sales'], ['operations', 'Operations'], ['developer', 'Developer']];
    var picker = '<div class="role-picker">' + roles.map(function (r) {
      var active = state.role === r[0] ? ' is-active' : '';
      return '<button type="button" class="role-chip' + active + '" data-role="' + r[0] + '"><span class="role-chip__icon">' + ROLE_ICONS[r[0]] + '</span>' + r[1] + '</button>';
    }).join('') + '</div>';

    var glossaryHtml = glossary.length ? '<div class="glossary"><div class="glossary__label">Key terms</div>' +
      glossary.map(function (g) { return '<p><dfn title="' + esc(g.definition) + '">' + esc(g.term) + '</dfn> &mdash; ' + esc(g.definition) + '</p>'; }).join('') +
      '</div>' : '';

    var cats = business.categories.filter(function (c) { return c !== 'Getting Started'; });
    var cards = cats.map(function (cat) {
      var pages = business.pages.filter(function (p) { return p.category === cat; });
      var first = pages.slice().sort(function (a, b) { return a.order - b.order; })[0];
      return '<a class="home-card" href="#/docs/' + slugify(cat) + '/' + first.slug + '">' +
        '<span class="home-card__icon" style="background:' + categoryColor(cat) + '22;color:' + categoryColor(cat) + '">' + esc(categoryLetter(cat)) + '</span>' +
        '<span class="home-card__title">' + esc(cat) + '</span>' +
        '<span class="home-card__desc">' + pages.map(function (p) { return esc(p.feature); }).join(', ') + '</span>' +
        '<span class="home-card__count">' + pages.length + (pages.length === 1 ? ' PAGE' : ' PAGES') + '</span></a>';
    }).join('') + '<a class="home-card" href="#/tech">' +
      '<span class="home-card__icon" style="background:' + categoryColor('Technical Reference') + '22;color:' + categoryColor('Technical Reference') + '">T</span>' +
      '<span class="home-card__title">Technical Reference</span>' +
      '<span class="home-card__desc">Living map of ' + tech.componentCount + ' components and ' + tech.edgeCount + ' edges &mdash; Apex, objects, features and versions.</span>' +
      '<span class="home-card__count">' + (tech.componentsByType.ApexClass || 0) + ' APEX CLASSES</span></a>';

    return picker + glossaryHtml + '<h2 id="browse-by-area">Browse by area</h2><div class="home-cards">' + cards + '</div>';
  }

  function setRole(role) {
    state.role = role;
    localSet('qe360:role', role);
    if (role === 'developer') { location.hash = '#/tech'; return; }
    location.hash = '#/';
    route(); // role change alone doesn't always change the hash, force a re-render
  }

  function renderBusinessPage(page, isOverview) {
    var deprecationBanner = page.deprecated
      ? '<div class="deprecation-banner">This page is deprecated.' + (page.replacement ? ' See <a href="#/docs/' + slugify(page.replacement.category) + '/' + page.replacement.slug + '">' + esc(page.replacement.title) + '</a> instead.' : '') + '</div>'
      : '';
    var related = page.related && page.related.length
      ? '<div class="related-chips">' + page.related.map(function (r) { return '<a class="related-chip" href="#/docs/' + slugify(r.category) + '/' + r.slug + '">' + esc(r.title) + '</a>'; }).join('') + '</div>'
      : '';
    var catPages = business.pages.filter(function (p) { return p.category === page.category; }).sort(function (a, b) { return a.order - b.order; });
    var idx = catPages.findIndex(function (p) { return p.slug === page.slug; });
    var prev = catPages[idx - 1], next = catPages[idx + 1];
    var prevNext = (prev || next) ? '<div class="page-nav">' +
      (prev ? '<a class="page-nav__link page-nav__link--prev" href="#/docs/' + slugify(prev.category) + '/' + prev.slug + '"><span class="page-nav__dir">Previous</span><span class="page-nav__title">' + esc(prev.feature) + '</span></a>' : '<span></span>') +
      (next ? '<a class="page-nav__link page-nav__link--next" href="#/docs/' + slugify(next.category) + '/' + next.slug + '"><span class="page-nav__dir">Next</span><span class="page-nav__title">' + esc(next.feature) + '</span></a>' : '') +
      '</div>' : '';

    var crumbCat = page.category;
    qs('#main').innerHTML =
      '<div class="prose-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> ' + esc(crumbCat) + ' <span>/</span> <span>' + esc(page.feature) + '</span></div>' +
      deprecationBanner +
      '<h1 class="page-title">' + esc(page.title) + '</h1>' +
      (page.description ? '<p class="page-subtitle">' + esc(page.description) + '</p>' : '') +
      metaRow(page) + toolbar(page) +
      (page.prerequisites && page.prerequisites.length ? '<div class="callout callout--before"><span class="callout__label">Before you start</span><ul>' + page.prerequisites.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="prose">' + page.html + (isOverview ? renderRoleAndGlossaryAndCards() : '') + '</div>' +
      related + prevNext +
      '</div>';

    wireToolbar(page);
    wireCollapsibleSections(page);
    if (isOverview) {
      qsa('[data-role]').forEach(function (btn) { btn.addEventListener('click', function () { setRole(btn.getAttribute('data-role')); }); });
    }
    var headings = (page.headings || []).slice();
    if (isOverview) headings.push({ id: 'browse-by-area', text: 'Browse by area' });
    buildTOC(headings);
  }

  function renderOverview() {
    var page = business.pages.find(function (p) { return p.isLanding; });
    if (page) renderBusinessPage(page, true);
  }

  function renderArticle(route) {
    var page = business.pages.find(function (p) { return slugify(p.category) === route.section && p.slug === route.page; });
    if (!page) { qs('#main').innerHTML = '<div class="prose-width"><h1 class="page-title">Not found</h1><p>No page at this address.</p></div>'; buildTOC([]); return; }
    renderBusinessPage(page, false);
  }

  // ================================================================
  // CHANGELOG
  // ================================================================
  function renderChangelog() {
    var releases = changelog.releases || [];
    var toc = releases.map(function (r) { return { id: 'release-' + r.version, text: r.version }; });
    var body = releases.length === 0
      ? '<div class="callout callout--note"><span class="callout__label">No releases yet</span><p>Run the pipeline after a force-app change to create the first one.</p></div>'
      : releases.map(function (r, i) {
        var groupOrder = [['Added', 'Features'], ['Changed', 'Improvements'], ['Removed', 'Fixes']];
        var groupsHtml = groupOrder.map(function (pair) {
          var items = r.groups[pair[0]] || [];
          if (!items.length) return '';
          return '<div class="release-group release-group--' + pair[0].toLowerCase() + '">' +
            '<span class="release-group__label">' + pair[1] + '</span><ul>' +
            items.map(function (it) { return '<li><code>' + esc(it.name) + '</code> <span style="color:var(--faint)">(' + esc(it.type) + ')</span></li>'; }).join('') +
            '</ul></div>';
        }).join('');
        var contributorAvatars = (r.contributors || []).map(function (name) {
          return '<span class="avatar-sm" style="background:' + colorFor(name) + '" title="' + esc(name) + '">' + esc(initialsOf(name)) + '</span>';
        }).join('');
        var firstContributor = (r.contributors || [])[0] || 'unknown';
        return '<div class="release" id="release-' + r.version + '">' +
          '<div class="release__rail">' +
          '<div class="tag-pill">&#127991; ' + esc(r.version) + '</div>' +
          (i === 0 ? '<div class="latest-badge">Latest release</div>' : '') +
          '<div class="release__date">Published ' + fmtDate(r.date) + '</div></div>' +
          '<div class="release-card">' +
          '<div class="release-card__title">Release ' + esc(r.version) + (r.hash ? ' <span class="mono" style="color:var(--faint);font-size:14px">(' + esc(r.hash) + ')</span>' : '') + '</div>' +
          '<div class="release-card__byline"><span class="avatar-sm" style="background:' + colorFor(firstContributor) + '">' + esc(initialsOf(firstContributor)) + '</span> ' + esc(firstContributor) + ' released this</div>' +
          (r.technicalSummary || r.businessSummary ? '<div class="commit__impact" style="margin-bottom:18px">' +
            (r.technicalSummary ? '<div class="commit__impact-row"><span class="commit__impact-label">Technical</span>' + esc(r.technicalSummary) + '</div>' : '') +
            (r.businessSummary ? '<div class="commit__impact-row"><span class="commit__impact-label">Business</span><span>' + esc(r.businessSummary) + featurePointerChips(r.businessFeatures) + '</span></div>' : '') +
            '</div>' : '') +
          groupsHtml +
          '<div class="release-card__footer"><div class="avatar-stack">' + contributorAvatars + '</div>' +
          (r.compareUrl ? '<a class="compare-link" href="' + esc(r.compareUrl) + '" target="_blank" rel="noopener">' + esc(r.compareRange || 'compare') + '</a>' : '<span></span>') +
          '</div></div></div>';
      }).join('');

    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <span>Changelog</span></div>' +
      '<h1 class="page-title">Changelog</h1>' +
      '<p class="page-subtitle">Release history for this documentation site, grouped like GitHub Releases. Newest first, generated from what actually changed in <code>force-app/</code>.</p>' +
      body + '</div>';
    buildTOC(toc);
  }

  // ================================================================
  // TECHNICAL OVERVIEW
  // ================================================================
  function statCard(n, l) { return '<div class="stat-card"><div class="n">' + (n || 0) + '</div><div class="l">' + esc(l) + '</div></div>'; }

  function renderTechOverview() {
    var byType = tech.componentsByType || {};
    var byRel = tech.edgesByRelationship || {};
    var typeRows = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; }).map(function (t) {
      return '<tr><td>' + esc(t) + '</td><td>' + byType[t] + '</td></tr>';
    }).join('');
    var relRows = Object.keys(byRel).sort(function (a, b) { return byRel[b] - byRel[a]; }).map(function (r) {
      return '<tr><td class="mono">' + esc(r) + '</td><td>' + byRel[r] + '</td></tr>';
    }).join('');

    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <span>Technical Reference</span></div>' +
      '<h1 class="page-title page-title--tech">Technical Reference</h1>' +
      '<p class="page-subtitle">Generated ' + esc(tech.generatedAt || '') + ' &middot; v' + esc(tech.version || 1) + ' &middot; ' + (tech.componentCount || 0) + ' components &middot; ' + (tech.edgeCount || 0) + ' edges</p>' +
      '<div class="stat-row">' + statCard(tech.componentCount, 'Components') + statCard(tech.edgeCount, 'Edges') + statCard(tech.features.length, 'Features') + statCard(versions.length, 'Versions') + '</div>' +
      '<div class="split-tables">' +
      '<div class="panel" id="by-type"><div class="panel__head">Components by type</div><div class="panel__scroll"><table class="kv">' + typeRows + '</table></div></div>' +
      '<div class="panel" id="by-rel"><div class="panel__head">Edges by relationship</div><div class="panel__scroll"><table class="kv">' + relRows + '</table></div></div>' +
      '</div></div>';
    buildTOC([{ id: 'by-type', text: 'Components by type' }, { id: 'by-rel', text: 'Edges by relationship' }]);
  }

  // ================================================================
  // COMPONENT INDEX
  // ================================================================
  function renderComponentIndex() {
    var apexWithCoverage = tech.components.filter(function (c) { return c.coverage != null; });
    var avgCoverage = apexWithCoverage.length ? Math.round(apexWithCoverage.reduce(function (a, c) { return a + c.coverage; }, 0) / apexWithCoverage.length) : 0;

    function draw() {
      var list = tech.components.filter(function (c) {
        if (state.indexFilter && c.name.toLowerCase().indexOf(state.indexFilter) === -1 && c.type.toLowerCase().indexOf(state.indexFilter) === -1) return false;
        if (state.healthFilter === 'warn' && c.health !== 'warn') return false;
        if (state.healthFilter === 'good' && c.health !== 'good') return false;
        return true;
      });
      if (state.indexSort === 'risk') {
        var rank = { warn: 0, good: 1, 'n/a': 2 };
        list = list.slice().sort(function (a, b) { return rank[a.health] - rank[b.health] || (a.coverage || 0) - (b.coverage || 0); });
      } else {
        list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      }

      var rows = list.map(function (c) {
        var cov = c.coverage;
        var covHtml = '<span class="mini-bar"><span style="width:' + (cov == null ? 0 : cov) + '%;background:' + coverageColor(cov) + '"></span></span>' +
          (cov == null ? '<span style="color:var(--faint)">&mdash;</span>' : cov + '%');
        return '<tr data-goto="' + esc(componentRouteHref(c.name)) + '">' +
          '<td><strong>' + esc(c.name) + '</strong></td>' +
          '<td class="mono" style="color:var(--muted)">' + esc(c.type) + '</td>' +
          '<td>' + covHtml + '</td>' +
          '<td style="color:var(--muted)">' + fmtDate(c.updated) + '</td>' +
          '<td><span class="dot dot--' + (c.health === 'good' ? 'good' : c.health === 'warn' ? 'warn' : 'na') + '"></span></td>' +
          '</tr>';
      }).join('');

      var tableOrEmpty = list.length
        ? '<div class="panel"><div class="panel__scroll"><table class="data-table" id="index-table"><thead><tr><th>Name</th><th>Type</th><th>Coverage</th><th>Updated</th><th>Health</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
        : '<div class="empty-state"><div>&#128269;</div><p>No components match these filters.</p><button type="button" id="clear-filters" class="btn-secondary">Clear filters</button></div>';

      qs('#index-body').innerHTML =
        '<div class="filter-row">' +
        ['all', 'warn', 'good'].map(function (h) {
          var label = h === 'all' ? 'All' : h === 'warn' ? 'Needs attention' : 'Healthy';
          return '<button type="button" class="chip' + (state.healthFilter === h ? ' is-active' : '') + '" data-health="' + h + '">' + label + '</button>';
        }).join('') +
        ['name', 'risk'].map(function (s) {
          return '<button type="button" class="chip' + (state.indexSort === s ? ' is-active' : '') + '" data-sort="' + s + '">Sort: ' + (s === 'name' ? 'Name' : 'Risk') + '</button>';
        }).join('') +
        '</div>' +
        '<input type="text" class="text-filter" id="index-text-filter" placeholder="Filter by name or type..." value="' + esc(state.indexFilter) + '">' +
        tableOrEmpty;

      qsa('[data-health]', qs('#index-body')).forEach(function (b) { b.addEventListener('click', function () { state.healthFilter = b.getAttribute('data-health'); draw(); }); });
      qsa('[data-sort]', qs('#index-body')).forEach(function (b) { b.addEventListener('click', function () { state.indexSort = b.getAttribute('data-sort'); draw(); }); });
      var textFilter = qs('#index-text-filter');
      if (textFilter) textFilter.addEventListener('input', function () { state.indexFilter = textFilter.value.toLowerCase(); draw(); });
      var clearBtn = qs('#clear-filters');
      if (clearBtn) clearBtn.addEventListener('click', function () { state.indexFilter = ''; state.healthFilter = 'all'; draw(); });
      qsa('tr[data-goto]', qs('#index-body')).forEach(function (tr) { tr.addEventListener('click', function () { location.hash = tr.getAttribute('data-goto'); }); });
      qs('#index-count').textContent = list.length === tech.components.length ? '(' + tech.components.length + ')' : '(' + list.length + ' of ' + tech.components.length + ')';
    }

    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <a href="#/tech">Technical Reference</a> <span>/</span> <span>Component Index</span></div>' +
      '<h1 class="page-title page-title--tech">Component Index <span id="index-count" style="color:var(--faint)"></span></h1>' +
      '<div class="coverage-stat"><div class="label">Documented coverage (static heuristic — not a real test run): <strong>' + avgCoverage + '%</strong></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + avgCoverage + '%"></div></div></div>' +
      '<div id="index-body"></div></div>';
    draw();
    buildTOC([]);
  }

  // ================================================================
  // CLASS / COMPONENT / OBJECT DETAIL
  // ================================================================
  function impactWalk(name) {
    var seen = new Set([name]);
    var frontier = [name];
    var levels = [];
    for (var depth = 0; depth < 5 && frontier.length; depth++) {
      var next = [];
      frontier.forEach(function (n) {
        var c = byComponentName[n];
        if (!c) return;
        (c.usedBy || []).forEach(function (e) { if (!seen.has(e.name)) { seen.add(e.name); next.push(e.name); } });
      });
      if (next.length) levels.push(next);
      frontier = next;
    }
    return levels;
  }

  function relTable(list) {
    if (!list.length) return '<div style="padding:16px 18px;color:var(--muted);font-size:13.5px">Nothing found &mdash; not proof this is unused, only that static analysis in this repo can\'t see a reference.</div>';
    var rows = list.map(function (e) {
      return '<tr><td><a href="' + componentRouteHref(e.name) + '">' + esc(e.name) + '</a></td><td class="mono">' + esc(e.relationship) + '</td><td><span class="' + confidenceClass(e.confidence) + '">' + esc(e.confidence) + '</span></td></tr>';
    }).join('');
    return '<table class="rel-table"><thead><tr><th>Component</th><th>Relationship</th><th>Confidence</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  var METHOD_VERB_MAP = {
    get: 'Returns', fetch: 'Returns', find: 'Finds', create: 'Creates', insert: 'Creates', build: 'Builds',
    update: 'Updates', delete: 'Deletes', remove: 'Removes', handle: 'Handles', process: 'Processes',
    validate: 'Validates', confirm: 'Confirms', send: 'Sends', is: 'Checks whether', has: 'Checks whether',
    run: 'Runs', execute: 'Executes', assign: 'Assigns', calculate: 'Calculates', sync: 'Synchronizes'
  };
  function humanizeMethodName(name) {
    var words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    var verb = words[0];
    var rest = words.slice(1).join(' ');
    var mapped = METHOD_VERB_MAP[verb];
    if (mapped) return mapped + (rest ? ' ' + rest + '.' : '.');
    return verb.charAt(0).toUpperCase() + verb.slice(1) + (rest ? ' ' + rest : '') + '.';
  }

  function renderRelatedPages(links) {
    return '<div class="related-pages-grid">' + links.map(function (l) {
      return '<a class="related-page-card" href="' + l.href + '"><span>' + esc(l.title) + '</span><span class="related-page-card__arrow">&rarr;</span></a>';
    }).join('') + '</div>';
  }

  function renderComponentDetail(name) {
    var c = byComponentName[name];
    if (!c) { qs('#main').innerHTML = '<div class="wide-width"><h1 class="page-title">Not found</h1><p>No component named "' + esc(name) + '".</p></div>'; buildTOC([]); return; }
    if (c.type === 'CustomObject') { renderObjectSchema(c); return; }

    var isClass = c.type === 'ApexClass';
    var toc = [];
    var purposeKey = 'qe360:purpose:' + c.name;
    var savedPurpose = localGet(purposeKey, '');

    var methodsHtml = (c.methods && c.methods.length) ? c.methods.map(function (m) {
      var key = c.name + '::' + m.name;
      var open = !!state.methodExpanded[key];
      var flags = [];
      if (m.auraEnabled) flags.push('<span class="pill pill--info">@AuraEnabled</span>');
      if (m.future) flags.push('<span class="pill pill--neutral">@future</span>');
      var usedIn = m.usedIn && m.usedIn.length
        ? m.usedIn.map(function (u) { return '<a href="' + componentRouteHref(u.name) + '">' + esc(u.name) + '</a> (' + esc(u.relationship) + ')'; }).join(', ')
        : 'No specific caller resolved &mdash; see Used by below.';
      return '<div class="method-row"><div class="method-row__top">' +
        '<span class="method-row__name">' + esc(m.name) + '</span><div class="method-row__flags">' + flags.join('') + '</div></div>' +
        '<p class="method-row__desc" title="Inferred from the method name — not verified">' + esc(humanizeMethodName(m.name)) + '</p>' +
        '<button type="button" class="method-row__toggle" data-method-toggle="' + esc(key) + '">' + (open ? '&#9662;' : '&#9656;') + ' signature &amp; used-in</button>' +
        '<div class="method-row__detail' + (open ? ' is-open' : '') + '" data-method-detail="' + esc(key) + '">' +
        '<div class="method-row__sig">' + esc(m.signature) + '</div>' +
        '<div class="method-row__usedin"><strong>Used in:</strong> ' + usedIn + '</div></div></div>';
    }).join('') : '<div style="color:var(--muted);font-size:13.5px">No methods detected.</div>';

    var statusWord = c.quality === 'High' ? 'Good' : 'Needs Attention';
    var aiReview = isClass ? '<div class="review-panel" id="ai-review">' +
      '<div class="ai-review__head"><span class="dot dot--' + (c.quality === 'High' ? 'good' : 'warn') + '"></span><strong>AI Review</strong>' +
      '<span class="ai-review__status">' + statusWord + '</span>' +
      '<span class="pill ' + (c.quality === 'High' ? 'pill--good' : c.quality === 'Medium' ? 'pill--warn' : 'pill--danger') + '">' + esc(c.quality || 'n/a') + '</span></div>' +
      '<p class="ai-review__note">' + (c.isTestClass ? 'This is a test class — coverage/quality heuristics don\'t apply to it.' : 'Auto-scaffold from static signals; enrich with a manual read.') + '</p>' +
      (c.securityFindings && c.securityFindings.length
        ? '<div class="security-heading">Security:</div><ul class="security-list">' + c.securityFindings.map(function (f) { return '<li><strong>' + esc(f.label) + ':</strong> ' + esc(f.note) + '</li>'; }).join('') + '</ul>'
        : '') +
      '</div>' : '';

    var purposePanel = '<div class="review-panel" id="purpose"><label class="review-panel__label">Purpose <span class="review-panel__label-sub">(interpretive &mdash; editable)</span></label>' +
      '<textarea id="purpose-input" placeholder="What does this component do, in your own words?" title="Saved to this browser only — not synced anywhere">' + esc(savedPurpose) + '</textarea>' +
      '<button type="button" class="save-btn" id="save-purpose">Save purpose</button></div>';

    toc.push({ id: 'purpose', text: 'Purpose' });
    if (isClass) toc.push({ id: 'ai-review', text: 'AI Review' });
    toc.push({ id: 'methods', text: 'Methods' }, { id: 'depends-on', text: 'Depends on' }, { id: 'used-by', text: 'Used by' });

    var covColor = coverageColor(c.coverage);
    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <a href="#/tech">Technical Reference</a> <span>/</span> <a href="#/tech/index">Index</a> <span>/</span> <span>' + esc(c.name) + '</span></div>' +
      '<a class="back-link" href="#/tech/index">&larr; Back to Component Index</a>' +
      '<div class="detail-head"><h1 class="page-title page-title--tech" style="word-break:break-word">' + esc(c.name) + '</h1><span class="dot dot--' + (c.health === 'good' ? 'good' : c.health === 'warn' ? 'warn' : 'na') + '"></span></div>' +
      '<div class="detail-path"><span class="type-badge">' + esc(c.type) + '</span> &middot; force-app/main/default/' + esc(c.path) + '</div>' +
      '<div class="meta-row">Updated ' + fmtDate(c.updated) + ' <span class="sep">&middot;</span> Owner: ' + esc(c.owner) +
      (c.coverage != null ? ' <span class="sep">&middot;</span> Coverage <strong style="color:' + covColor + '">' + c.coverage + '%</strong>' : '') +
      ' <span class="sep">&middot;</span> <span class="pill pill--warn">+ Auto-generated</span></div>' +
      '<div class="toolbar"><button id="copy-md-btn">Copy as Markdown</button><button id="impact-btn">Impact</button></div>' +
      purposePanel + aiReview +
      '<h2 id="methods">Methods (' + (c.methods ? c.methods.length : 0) + ')</h2>' + methodsHtml +
      '<div class="split-tables" style="margin-top:36px">' +
      '<div><h2 id="depends-on">Depends on (' + c.dependsOn.length + ')</h2><div class="panel"><div class="panel__scroll">' + relTable(c.dependsOn) + '</div></div></div>' +
      '<div><h2 id="used-by">Used by (' + c.usedBy.length + ')</h2><div class="panel"><div class="panel__scroll">' + relTable(c.usedBy) + '</div></div></div>' +
      '</div>' +
      '<div id="impact-panel"></div>' +
      '<h2 style="margin-top:36px">Related Pages</h2>' + renderRelatedPages([
        { title: 'Component Index', href: '#/tech/index' },
        { title: 'Technical Overview', href: '#/tech' },
      ]) +
      '</div>';

    qsa('[data-method-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-method-toggle');
        state.methodExpanded[key] = !state.methodExpanded[key];
        var open = state.methodExpanded[key];
        var detail = qs('[data-method-detail="' + key.replace(/"/g, '') + '"]');
        if (detail) detail.classList.toggle('is-open', open);
        btn.innerHTML = (open ? '&#9662;' : '&#9656;') + ' signature &amp; used-in';
      });
    });

    var saveBtn = qs('#save-purpose');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      localSet(purposeKey, qs('#purpose-input').value);
      flashButton(saveBtn, 'Saved');
    });

    qs('#copy-md-btn').addEventListener('click', function () {
      var lines = ['# ' + c.name, '', c.type + ' — `force-app/main/default/' + c.path + '`', '', '## Depends on']
        .concat(c.dependsOn.map(function (e) { return '- ' + e.name + ' (' + e.relationship + ', ' + e.confidence + ')'; }))
        .concat(['', '## Used by'])
        .concat(c.usedBy.map(function (e) { return '- ' + e.name + ' (' + e.relationship + ', ' + e.confidence + ')'; }));
      navigator.clipboard.writeText(lines.join('\n'));
      flashButton(qs('#copy-md-btn'), 'Copied');
    });

    var impactBtn = qs('#impact-btn');
    impactBtn.classList.toggle('is-active', !!state.impactOpen[c.name]);
    function renderImpact() {
      var panel = qs('#impact-panel');
      if (!state.impactOpen[c.name]) { panel.innerHTML = ''; return; }
      var levels = impactWalk(c.name);
      var direct = levels[0] || [];
      var transitive = levels.slice(1).reduce(function (a, l) { return a + l.length; }, 0);
      var referenced = c.dependsOn.length;
      var html = '<div class="impact-panel"><div class="panel__head">Impact analysis &middot; blast radius</div><div class="impact-stats">' +
        statCard(direct.length, 'Direct dependents') + statCard(transitive, 'Transitive dependents') + statCard(referenced, 'Objects/classes referenced') +
        '</div>' +
        '<p class="impact-panel__note">Changing this class could ripple through its direct dependents and their callers. Review the Used-by list and run the highlighted test classes before deploying.</p>';
      levels.forEach(function (level, i) {
        html += '<div class="panel"><div class="panel__head">Depth ' + (i + 1) + '</div><div class="panel__scroll"><table class="rel-table">' +
          level.map(function (n) { return '<tr><td><a href="' + componentRouteHref(n) + '">' + esc(n) + '</a></td></tr>'; }).join('') + '</table></div></div>';
      });
      html += '<p style="color:var(--muted);font-size:13px">Static analysis only — this can\'t see org-side jobs, external API callers, or Flow/Process Builder config not in source.</p></div>';
      panel.innerHTML = html;
      if (panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    impactBtn.addEventListener('click', function () {
      state.impactOpen[c.name] = !state.impactOpen[c.name];
      impactBtn.classList.toggle('is-active', state.impactOpen[c.name]);
      renderImpact();
    });
    renderImpact();

    buildTOC(toc);
  }

  function renderObjectSchema(c) {
    var schema = tech.schemas[c.name] || { label: c.name, fields: [], recordTypes: [], relationships: [] };
    var fieldRows = schema.fields.map(function (f) {
      return '<tr><td>' + esc(f.label) + '</td><td class="mono">' + esc(f.apiName) + '</td><td class="mono">' + esc(f.type) + '</td><td>' + (f.required ? '<span class="req-dot"></span>' : '') + '</td></tr>';
    }).join('');
    var recordTypesHtml = schema.recordTypes.length
      ? schema.recordTypes.map(function (rt) { return '<span class="record-type-chip">' + esc(rt) + '</span>'; }).join('')
      : '<div style="color:var(--muted);font-size:13.5px">No record types defined.</div>';
    var relHtml = schema.relationships.length
      ? '<table class="rel-table"><thead><tr><th>Object</th><th></th></tr></thead><tbody>' +
        schema.relationships.map(function (r) { return '<tr><td><a href="' + componentRouteHref(r.name) + '">' + esc(r.name) + '</a></td><td style="color:var(--muted)">' + esc(r.direction) + '</td></tr>'; }).join('') + '</tbody></table>'
      : '<div style="color:var(--muted);font-size:13.5px">No relationships to other objects.</div>';

    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <a href="#/tech">Technical Reference</a> <span>/</span> <a href="#/tech/index">Index</a> <span>/</span> <span>' + esc(c.name) + '</span></div>' +
      '<a class="back-link" href="#/tech/index">&larr; Back to Component Index</a>' +
      '<h1 class="page-title page-title--tech">' + esc(c.name) + '</h1>' +
      '<div class="detail-path"><span class="type-badge">CustomObject</span> ' + esc(schema.label) + '</div>' +
      '<h2 id="fields">Fields (' + schema.fields.length + ')</h2><div class="panel"><div class="panel__scroll"><table class="data-table"><thead><tr><th>Label</th><th>API Name</th><th>Type</th><th>Req</th></tr></thead><tbody>' + fieldRows + '</tbody></table></div></div>' +
      '<h2 id="record-types">Record Types</h2>' + recordTypesHtml +
      '<h2 id="relationships">Relationships</h2>' + relHtml +
      '<h2 style="margin-top:36px">Related Pages</h2>' + renderRelatedPages([
        { title: 'Component Index', href: '#/tech/index' },
        { title: 'Technical Overview', href: '#/tech' },
      ]) +
      '</div>';
    buildTOC([{ id: 'fields', text: 'Fields' }, { id: 'record-types', text: 'Record Types' }, { id: 'relationships', text: 'Relationships' }]);
  }

  // ================================================================
  // FEATURES
  // ================================================================
  function qualityPillClass(q) { return q === 'High' ? 'pill--good' : q === 'Medium' ? 'pill--warn' : 'pill--danger'; }

  function featurePointerChips(titles) {
    if (!titles || !titles.length) return '';
    return '<span class="feature-pointer-list">' + titles.map(function (title) {
      var feat = tech.features.find(function (f) { return f.title === title; });
      return feat ? '<a class="feature-pointer" href="#/tech/features/' + encodeURIComponent(feat.slug) + '">' + esc(title) + '</a>' : '<span class="feature-pointer">' + esc(title) + '</span>';
    }).join('') + '</span>';
  }

  function renderFeatures() {
    var cards = tech.features.map(function (f) {
      return '<a class="feature-card" href="#/tech/features/' + encodeURIComponent(f.slug) + '">' +
        '<span class="feature-card__title">' + esc(f.title) + '</span>' +
        '<span class="feature-card__desc">' + esc(f.description || '') + '</span>' +
        '<span class="feature-card__footer"><span class="feature-card__meta">' + f.memberCount + ' members</span><span class="sep">&middot;</span>' +
        '<span class="pill ' + qualityPillClass(f.quality) + '">' + esc(f.quality) + '</span></span></a>';
    }).join('');
    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <a href="#/tech">Technical Reference</a> <span>/</span> <span>Features</span></div>' +
      '<h1 class="page-title page-title--tech">Features (' + tech.features.length + ')</h1>' +
      '<p class="page-subtitle">Auto-clustered from the dependency graph — click a feature to see everything in it.</p>' +
      (tech.features.length ? '<div class="features-grid">' + cards + '</div>' : '<p style="color:var(--muted)">No multi-component clusters detected yet — features emerge as more of the codebase is connected by real dependencies.</p>') +
      '</div>';
    buildTOC([]);
  }

  function renderFeatureDetail(slug) {
    var f = tech.features.find(function (x) { return x.slug === slug; });
    if (!f) { qs('#main').innerHTML = '<div class="wide-width"><h1 class="page-title">Not found</h1><p>No feature named "' + esc(slug) + '".</p></div>'; buildTOC([]); return; }

    var contextKey = 'qe360:feature-context:' + f.slug;
    var savedContext = localGet(contextKey, '');
    var memberChips = f.members.slice().sort().map(function (name) {
      var c = byComponentName[name];
      return '<a class="record-type-chip" href="' + componentRouteHref(name) + '">' + esc(name) + (c ? ' <span style="color:var(--faint)">(' + esc(c.type) + ')</span>' : '') + '</a>';
    }).join('');

    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <a href="#/tech">Technical Reference</a> <span>/</span> <a href="#/tech/features">Features</a> <span>/</span> <span>' + esc(f.title) + '</span></div>' +
      '<a class="back-link" href="#/tech/features">&larr; Back to Features</a>' +
      '<h1 class="page-title page-title--tech">' + esc(f.title) + '</h1>' +
      '<p class="page-subtitle">' + esc(f.description || '') + '</p>' +
      '<div class="review-panel" id="business-context"><label class="review-panel__label">Business context <span class="pill ' + qualityPillClass(f.quality) + '">' + esc(f.quality) + '</span></label>' +
      '<textarea id="context-input" placeholder="What does this feature do for the business, in plain language?">' + esc(savedContext) + '</textarea>' +
      '<button type="button" class="save-btn" id="save-context">Save</button>' +
      (!savedContext ? '<p style="color:var(--muted);font-size:13px;margin:10px 0 0"><em>(needs enrichment &mdash; inferred from naming; confirm with a product owner)</em></p>' : '') +
      '</div>' +
      '<h2 id="members">Members (' + f.memberCount + ')</h2>' +
      '<div style="display:flex;flex-wrap:wrap;gap:0">' + memberChips + '</div>' +
      '</div>';

    var saveBtn = qs('#save-context');
    saveBtn.addEventListener('click', function () {
      localSet(contextKey, qs('#context-input').value);
      flashButton(saveBtn, 'Saved');
    });

    buildTOC([{ id: 'members', text: 'Members' }]);
  }

  // ================================================================
  // VERSION HISTORY
  // ================================================================
  function renderVersionHistory() {
    var html = versions.length === 0
      ? '<div class="callout callout--note"><span class="callout__label">No history yet</span><p>This needs to run inside a git repository with commits touching force-app/.</p></div>'
      : '<div class="commit-timeline">' + versions.map(function (v, i) {
        var total = v.additions + v.deletions;
        var addSquares = total ? Math.round((v.additions / total) * 5) : 0;
        var squares = Array.from({ length: 5 }, function (_, si) { return '<span style="background:' + (si < addSquares ? 'var(--health-good)' : '#ef4444') + '"></span>'; }).join('');
        var addedChips = v.added.map(function (n) { return '<span class="change-chip change-chip--added">+ ' + esc(n) + '</span>'; }).join('');
        var modifiedChips = (v.modified || []).map(function (n) { return '<span class="change-chip change-chip--modified">&#8226; ' + esc(n) + '</span>'; }).join('');
        var removedChips = v.removed.map(function (n) { return '<span class="change-chip change-chip--removed">&minus; ' + esc(n) + '</span>'; }).join('');
        var description = v.description ? '<p class="commit__description">' + esc(v.description) + '</p>' : '';
        return '<div class="commit"><div class="commit__rail"><div class="commit__avatar" style="background:' + v.avatarBg + '">' + esc(v.initials) + '</div>' + (i < versions.length - 1 ? '<div class="commit__line"></div>' : '') + '</div>' +
          '<div class="commit__body">' +
          '<div class="commit__summary">' + esc(v.summary) + (v.latest ? ' <span class="pill pill--info">LATEST</span>' : '') + '</div>' +
          '<div class="commit__meta"><strong>' + esc(v.author) + '</strong> committed <code>' + esc(v.hash) + '</code> &middot; ' + timeAgo(v.when) + ' &middot; tag ' + esc(v.version) + ' &middot; ' + v.filesChanged + ' files changed</div>' +
          description +
          '<div class="commit__diffstat"><span class="diff-add">+' + v.additions + '</span><span class="diff-del">&minus;' + v.deletions + '</span><span class="diff-squares">' + squares + '</span></div>' +
          '<div class="change-chips">' + addedChips + modifiedChips + removedChips + '</div>' +
          '<div class="commit__impact">' +
          '<div class="commit__impact-row"><span class="commit__impact-label">Technical</span>' + esc(v.technicalSummary || '') + '</div>' +
          '<div class="commit__impact-row"><span class="commit__impact-label">Business</span><span>' + esc(v.businessSummary || '') + featurePointerChips(v.businessFeatures) + '</span></div>' +
          '</div>' +
          '</div></div>';
      }).join('') + '</div>';

    qs('#main').innerHTML = '<div class="wide-width">' +
      '<div class="crumbs"><a href="#/">Docs</a> <span>/</span> <a href="#/tech">Technical Reference</a> <span>/</span> <span>Version History</span></div>' +
      '<h1 class="page-title page-title--tech">Version History <span style="color:var(--faint)">(current ' + (versions[0] ? versions[0].version : 'v0') + ')</span></h1>' +
      '<p class="page-subtitle">Every build is a snapshot of the commits that touched force-app/. Newest first.</p>' +
      html + '</div>';
    buildTOC([]);
  }

  // ================================================================
  // DOWNLOAD MODAL
  // ================================================================
  function openDownloadModal(scope) {
    state.downloadModalOpen = true;
    state.downloadScope = scope || '__all__';
    renderModal();
  }
  function closeDownloadModal() { state.downloadModalOpen = false; qs('#modal-root').innerHTML = ''; }

  function renderModal() {
    if (!state.downloadModalOpen) { qs('#modal-root').innerHTML = ''; return; }
    var opts = business.categories.map(function (c) { return '<option value="' + esc(c) + '"' + (state.downloadScope === c ? ' selected' : '') + '>' + esc(c) + ' only</option>'; }).join('');
    qs('#modal-root').innerHTML = '<div class="modal-backdrop" id="modal-backdrop"><div class="modal">' +
      '<div class="modal__head"><h2>Download documentation</h2><button type="button" class="modal__close" id="modal-close">&times;</button></div>' +
      '<label class="field-label">Which documentation?</label>' +
      '<select id="download-scope"><option value="__all__"' + (state.downloadScope === '__all__' ? ' selected' : '') + '>All documentation (' + business.pages.length + ' pages)</option>' +
      '<option value="__tech__">Technical only</option>' + opts + '</select>' +
      '<label class="field-label">Format</label>' +
      '<label class="radio-option' + (state.downloadFormat === 'pdf' ? ' is-selected' : '') + '"><input type="radio" name="fmt" value="pdf"' + (state.downloadFormat === 'pdf' ? ' checked' : '') + '> <span><strong>PDF</strong> &mdash; opens a print view; choose "Save as PDF"</span></label>' +
      '<label class="radio-option' + (state.downloadFormat === 'doc' ? ' is-selected' : '') + '"><input type="radio" name="fmt" value="doc"' + (state.downloadFormat === 'doc' ? ' checked' : '') + '> <span><strong>Word document (.doc)</strong> &mdash; downloads a Word-openable file</span></label>' +
      '<div class="modal__foot"><button type="button" class="btn-secondary" id="modal-cancel">Cancel</button><button type="button" class="btn-primary" id="modal-download">Download</button></div>' +
      '</div></div>';

    qs('#modal-backdrop').addEventListener('click', function (e) { if (e.target.id === 'modal-backdrop') closeDownloadModal(); });
    qs('#modal-close').addEventListener('click', closeDownloadModal);
    qs('#modal-cancel').addEventListener('click', closeDownloadModal);
    qs('#download-scope').addEventListener('change', function (e) { state.downloadScope = e.target.value; });
    qsa('input[name="fmt"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.downloadFormat = r.value;
        qsa('.radio-option').forEach(function (o) { o.classList.toggle('is-selected', o.querySelector('input').value === r.value); });
      });
    });
    qs('#modal-download').addEventListener('click', function () { runDownload(state.downloadScope, state.downloadFormat); closeDownloadModal(); });
  }

  var EXPORT_CSS = 'body{font-family:Georgia,serif;color:#222;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}' +
    'h1{font-size:28px}h2{font-size:20px;margin-top:28px}.doc{margin-bottom:40px}.lede{color:#666;font-style:italic}' +
    'code{background:#f3f2fb;padding:2px 5px;border-radius:4px}';

  function pagesForScope(scope) {
    if (scope === '__all__') return business.pages;
    if (scope === '__tech__') return [];
    return business.pages.filter(function (p) { return p.category === scope; });
  }

  function runDownload(scope, format) {
    var pages = pagesForScope(scope);
    var title = scope === '__all__' ? (DATA.siteName || 'Documentation') : scope === '__tech__' ? 'Technical Reference' : scope;
    var body = pages.map(function (p) { return '<section class="doc"><h1>' + esc(p.title) + '</h1>' + (p.description ? '<p class="lede">' + esc(p.description) + '</p>' : '') + p.html + '</section>'; }).join('<div style="page-break-before:always"></div>');
    if (!body) body = '<p>Nothing to export for this selection in this demo.</p>';
    if (format === 'doc') {
      var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + EXPORT_CSS + '</style></head><body><h1>' + esc(title) + '</h1>' + body + '</body></html>';
      var blob = new Blob(['﻿', html], { type: 'application/msword' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = (title || 'documentation').replace(/[^a-z0-9]+/gi, '-') + '.doc';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } else {
      var w = window.open('', '_blank');
      if (!w) { alert('Please allow pop-ups so the PDF print view can open.'); return; }
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + EXPORT_CSS + '</style></head><body><h1>' + esc(title) + '</h1>' + body + '</body></html>');
      w.document.close(); w.focus();
      setTimeout(function () { w.print(); }, 400);
    }
  }

  qs('#btn-download').addEventListener('click', function () { openDownloadModal('__all__'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.downloadModalOpen) closeDownloadModal(); });

  // ================================================================
  // SEARCH
  // ================================================================
  function searchIndex() {
    var idx = business.pages.map(function (p) { return { kind: 'Business', title: p.feature, sub: p.category, href: '#/docs/' + slugify(p.category) + '/' + p.slug }; });
    idx = idx.concat(tech.components.map(function (c) { return { kind: c.type, title: c.name, sub: c.path, href: componentRouteHref(c.name) }; }));
    idx.push({ kind: 'Page', title: 'Changelog', sub: 'Release history', href: '#/changelog' });
    idx.push({ kind: 'Page', title: 'Technical Reference', sub: 'Overview', href: '#/tech' });
    return idx;
  }
  var SEARCH_INDEX = searchIndex();
  var searchModalOpen = false;

  function renderSearchResults(q) {
    var results = qs('#search-modal-results');
    if (!results) return;
    q = q.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    var hits = SEARCH_INDEX.filter(function (item) { return item.title.toLowerCase().indexOf(q) !== -1; }).slice(0, 20);
    results.innerHTML = hits.length
      ? hits.map(function (h) { return '<a class="search-hit" href="' + h.href + '">' + esc(h.title) + '<small>' + esc(h.kind) + ' &middot; ' + esc(h.sub) + '</small></a>'; }).join('')
      : '<div class="search-hit search-hit--empty">No matches</div>';
    qsa('.search-hit[href]', results).forEach(function (a) { a.addEventListener('click', closeSearchModal); });
  }

  function openSearchModal() {
    searchModalOpen = true;
    qs('#search-modal-root').innerHTML =
      '<div class="modal-backdrop" id="search-backdrop">' +
      '<div class="search-modal">' +
      '<div class="search-modal__input-row"><span aria-hidden="true">&#128269;</span>' +
      '<input id="search-modal-input" type="text" placeholder="Search documentation..." autocomplete="off">' +
      '<span class="kbd">ESC</span></div>' +
      '<div id="search-modal-results" class="search-results"></div>' +
      '</div></div>';
    qs('#search-backdrop').addEventListener('click', function (e) { if (e.target.id === 'search-backdrop') closeSearchModal(); });
    var input = qs('#search-modal-input');
    input.addEventListener('input', function () { renderSearchResults(input.value); });
    input.focus();
  }
  function closeSearchModal() {
    searchModalOpen = false;
    qs('#search-modal-root').innerHTML = '';
  }

  qs('#search-trigger').addEventListener('click', openSearchModal);
  document.addEventListener('keydown', function (e) {
    if (searchModalOpen && e.key === 'Escape') { closeSearchModal(); return; }
    if (e.key === '/' && !searchModalOpen && !state.downloadModalOpen && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); openSearchModal();
    }
  });

  // ================================================================
  // ROUTER DISPATCH
  // ================================================================
  function route() {
    var r = currentRoute();
    renderSidebar(r);
    renderTopbarState(r);
    if (r.name === 'overview') renderOverview();
    else if (r.name === 'article') renderArticle(r);
    else if (r.name === 'changelog') renderChangelog();
    else if (r.name === 'tech-overview') renderTechOverview();
    else if (r.name === 'tech-index') renderComponentIndex();
    else if (r.name === 'tech-features') renderFeatures();
    else if (r.name === 'tech-feature-detail') renderFeatureDetail(r.target);
    else if (r.name === 'tech-versions') renderVersionHistory();
    else if (r.name === 'tech-class' || r.name === 'tech-object' || r.name === 'tech-component') renderComponentDetail(r.target);
    else renderOverview();
    window.scrollTo(0, 0);
    setTimeout(setupScrollSpy, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
