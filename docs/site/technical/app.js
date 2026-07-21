(function () {
  'use strict';
  var data = window.__TECH_DATA__ || { components: [], componentsByType: {}, edgesByRelationship: {} };
  var byName = {};
  data.components.forEach(function (c) { byName[c.name] = c; });

  var main = document.getElementById('main');
  var tree = document.getElementById('tree');

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pillClass(confidence) {
    if (confidence === 'High') return 'pill pill--high';
    if (confidence === 'Medium') return 'pill pill--medium';
    return 'pill pill--low';
  }

  // ---------------- theme ----------------
  var themeBtn = document.getElementById('theme-toggle');
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'light' ? '☽' : '☀';
    try { localStorage.setItem('tech-docs-theme', t); } catch (e) { /* ignore */ }
  }
  applyTheme((function () { try { return localStorage.getItem('tech-docs-theme') || 'dark'; } catch (e) { return 'dark'; } })());
  themeBtn.addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  // ---------------- source tree ----------------
  function buildTree() {
    var root = {};
    data.components.forEach(function (c) {
      var parts = c.path.split('/');
      parts.pop(); // drop the filename (or, for LWC bundles, the bundle dir itself stays as the leaf)
      var node = root;
      parts.forEach(function (part) {
        node.children = node.children || {};
        node.children[part] = node.children[part] || {};
        node = node.children[part];
      });
      node.items = node.items || [];
      node.items.push(c);
    });
    return root;
  }

  function renderTreeNode(node, path) {
    var html = '';
    if (node.children) {
      Object.keys(node.children).sort().forEach(function (name) {
        html += '<details class="tree__folder" open>' +
          '<summary>' + esc(name) + '</summary>' +
          '<div class="tree__children">' + renderTreeNode(node.children[name], path.concat(name)) + '</div>' +
          '</details>';
      });
    }
    if (node.items) {
      node.items.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
        html += '<a class="tree__item" data-name="' + esc(c.name) + '" href="#/component/' + encodeURIComponent(c.name) + '">' +
          '<span class="dot dot--' + healthColor(c.health) + '"></span>' + esc(c.name) + '</a>';
      });
    }
    return html;
  }

  function healthColor(health) {
    if (health === 'good') return 'green';
    if (health === 'warning') return 'amber';
    if (health === 'critical') return 'red';
    return 'grey';
  }

  tree.innerHTML = renderTreeNode(buildTree(), []);
  document.getElementById('expand-all').addEventListener('click', function () {
    var allOpen = Array.from(tree.querySelectorAll('details')).every(function (d) { return d.open; });
    tree.querySelectorAll('details').forEach(function (d) { d.open = !allOpen; });
  });

  // ---------------- pages ----------------
  function renderOverview() {
    var byType = data.componentsByType || {};
    var byRel = data.edgesByRelationship || {};
    var typeRows = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; })
      .map(function (t) { return '<tr><td>' + esc(t) + '</td><td>' + byType[t] + '</td></tr>'; }).join('');
    var relRows = Object.keys(byRel).sort(function (a, b) { return byRel[b] - byRel[a]; })
      .map(function (r) { return '<tr><td>' + esc(r) + '</td><td>' + byRel[r] + '</td></tr>'; }).join('');

    main.innerHTML =
      '<div class="crumbs">Overview</div>' +
      '<h1 class="page-title">Technical Documentation</h1>' +
      '<p class="page-sub">Generated ' + esc(data.generatedAt || '') + ' &middot; v' + esc(data.version || 1) + ' &middot; ' +
        (data.componentCount || 0) + ' components &middot; ' + (data.edgeCount || 0) + ' edges</p>' +
      '<div class="stat-row">' +
        statCard(data.componentCount, 'Components') +
        statCard(data.edgeCount, 'Edges') +
        statCard(Object.keys(byType).length, 'Component types') +
        statCard(Object.keys(byRel).length, 'Relationship types') +
      '</div>' +
      '<div class="split-tables">' +
        '<div class="panel"><div class="panel__head">Components by type</div><table class="kv">' + typeRows + '</table></div>' +
        '<div class="panel"><div class="panel__head">Edges by relationship</div><table class="kv">' + relRows + '</table></div>' +
      '</div>';
  }

  function statCard(n, l) {
    return '<div class="stat-card"><div class="n">' + (n || 0) + '</div><div class="l">' + esc(l) + '</div></div>';
  }

  function renderIndex() {
    var rows = data.components.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (c) {
        return '<tr>' +
          '<td><span class="dot dot--' + healthColor(c.health) + '"></span><a href="#/component/' + encodeURIComponent(c.name) + '">' + esc(c.name) + '</a></td>' +
          '<td>' + esc(c.type) + '</td>' +
          '<td class="mono">' + esc(c.path) + '</td>' +
          '</tr>';
      }).join('');

    main.innerHTML =
      '<div class="crumbs">Component Index</div>' +
      '<h1 class="page-title">All Components</h1>' +
      '<p class="page-sub">' + data.components.length + ' components discovered in force-app</p>' +
      '<div class="panel"><table class="rel"><tr><th>Name</th><th>Type</th><th>Path</th></tr>' + rows + '</table></div>';
  }

  function relTable(list, direction) {
    if (!list.length) return '<div class="empty-note">' + (direction === 'in' ? 'Nothing found to reference this — that\'s not proof it\'s unused, see the methodology notes.' : 'No detected dependencies.') + '</div>';
    var rows = list.map(function (e) {
      return '<tr><td><a href="#/component/' + encodeURIComponent(e.name) + '">' + esc(e.name) + '</a></td>' +
        '<td class="mono">' + esc(e.relationship) + '</td>' +
        '<td><span class="' + pillClass(e.confidence) + '">' + esc(e.confidence) + '</span></td></tr>';
    }).join('');
    return '<table class="rel"><tr><th>Component</th><th>Relationship</th><th>Confidence</th></tr>' + rows + '</table>';
  }

  function impactWalk(name) {
    var seen = new Set([name]);
    var frontier = [name];
    var levels = [];
    for (var depth = 0; depth < 4 && frontier.length; depth++) {
      var next = [];
      frontier.forEach(function (n) {
        var c = byName[n];
        if (!c) return;
        (c.usedBy || []).forEach(function (e) {
          if (!seen.has(e.name)) { seen.add(e.name); next.push(e.name); }
        });
      });
      if (next.length) levels.push(next);
      frontier = next;
    }
    return levels;
  }

  function renderComponent(name) {
    var c = byName[name];
    if (!c) { main.innerHTML = '<div class="crumbs">Overview / Component Index</div><h1 class="page-title">Not found</h1><p class="page-sub">No component named "' + esc(name) + '".</p>'; return; }

    var methodsHtml = (c.methods && c.methods.length)
      ? c.methods.map(function (m) {
          var flags = [];
          if (m.auraEnabled) flags.push('<span class="badge badge--info">@AuraEnabled</span>');
          if (m.future) flags.push('<span class="badge badge--grey">@future</span>');
          return '<div class="method"><div class="method__name">' + esc(m.name) + '</div>' +
            '<div class="method__sig">' + esc(m.signature) + '</div>' +
            (flags.length ? '<div class="method__flags">' + flags.join('') + '</div>' : '') + '</div>';
        }).join('')
      : '<div class="empty-note">No methods detected (or this component type doesn\'t have any).</div>';

    main.innerHTML =
      '<div class="crumbs"><a href="#/overview">Overview</a> / <a href="#/index">Index</a> / ' + esc(c.name) + '</div>' +
      '<div class="detail-head"><h1 class="page-title">' + esc(c.name) + ' <span class="dot dot--' + healthColor(c.health) + '" style="margin-left:6px"></span></h1></div>' +
      '<div class="detail-path">' + esc(c.type) + ' &middot; force-app/main/default/' + esc(c.path) + '</div>' +
      '<div class="btn-row">' +
        '<button class="btn" id="copy-md-btn">Copy as Markdown</button>' +
        '<button class="btn" id="impact-btn">Impact</button>' +
      '</div>' +
      '<div class="review-box"><div class="review-box__head"><span class="badge badge--grey">Unreviewed</span></div>' +
        '<p>' + (c.purpose || 'Auto-detected from static analysis — no interpretive review yet. This layer is deliberately honest rather than invented: a person (or a scoped enrichment pass) needs to read the code before this says what the component is for.') + '</p></div>' +
      '<h3>Methods (' + (c.methods ? c.methods.length : 0) + ')</h3>' + methodsHtml +
      '<h3 style="margin-top:28px">Depends on (' + c.dependsOn.length + ')</h3><div class="panel">' + relTable(c.dependsOn, 'out') + '</div>' +
      '<h3>Used by (' + c.usedBy.length + ')</h3><div class="panel">' + relTable(c.usedBy, 'in') + '</div>' +
      '<div id="impact-panel"></div>';

    document.getElementById('copy-md-btn').addEventListener('click', function () {
      var lines = ['# ' + c.name, '', c.type + ' — `force-app/main/default/' + c.path + '`', '',
        '## Depends on', ...(c.dependsOn.map(function (e) { return '- ' + e.name + ' (' + e.relationship + ', ' + e.confidence + ')'; })),
        '', '## Used by', ...(c.usedBy.map(function (e) { return '- ' + e.name + ' (' + e.relationship + ', ' + e.confidence + ')'; }))];
      navigator.clipboard.writeText(lines.join('\n'));
      var b = document.getElementById('copy-md-btn'); var old = b.textContent;
      b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1200);
    });

    document.getElementById('impact-btn').addEventListener('click', function () {
      var levels = impactWalk(c.name);
      var panel = document.getElementById('impact-panel');
      if (!levels.length) {
        panel.innerHTML = '<div class="panel"><div class="panel__head">Impact</div><div class="empty-note">Nothing transitively depends on this, as far as static analysis in this repo can see.</div></div>';
        return;
      }
      var html = '<div class="panel"><div class="panel__head">Impact — transitive "used by" walk</div>';
      levels.forEach(function (level, i) {
        html += '<table class="rel"><tr><th>Depth ' + (i + 1) + '</th></tr>' +
          level.map(function (n) { return '<tr><td><a href="#/component/' + encodeURIComponent(n) + '">' + esc(n) + '</a></td></tr>'; }).join('') + '</table>';
      });
      html += '<div class="empty-note">Static analysis only — this can\'t see org-side jobs, external API callers, or Flow/Process Builder config. Confirm org-side before treating this as complete.</div></div>';
      panel.innerHTML = html;
    });
  }

  // ---------------- search ----------------
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  function runSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
    var hits = data.components.filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 20);
    if (!hits.length) { searchResults.hidden = false; searchResults.innerHTML = '<div class="search-hit">No matches</div>'; return; }
    searchResults.innerHTML = hits.map(function (c) {
      return '<a class="search-hit" href="#/component/' + encodeURIComponent(c.name) + '">' + esc(c.name) + '<small>' + esc(c.type) + ' &middot; ' + esc(c.path) + '</small></a>';
    }).join('');
    searchResults.hidden = false;
  }
  searchInput.addEventListener('input', function () { runSearch(searchInput.value); });
  searchInput.addEventListener('blur', function () { setTimeout(function () { searchResults.hidden = true; }, 150); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); }
    if (e.key === 'Escape') { searchResults.hidden = true; searchInput.blur(); }
  });

  // ---------------- router ----------------
  function setActiveNav(route) {
    document.querySelectorAll('.nav__link').forEach(function (a) { a.classList.toggle('is-active', a.dataset.route === route); });
    document.querySelectorAll('.tree__item').forEach(function (a) {
      a.classList.toggle('is-active', route === 'component' && a.dataset.name === currentComponentName);
    });
  }
  var currentComponentName = null;
  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    if (parts[0] === 'component' && parts[1]) {
      currentComponentName = decodeURIComponent(parts[1]);
      renderComponent(currentComponentName);
      setActiveNav('component');
    } else if (parts[0] === 'index') {
      currentComponentName = null;
      renderIndex();
      setActiveNav('index');
    } else {
      currentComponentName = null;
      renderOverview();
      setActiveNav('overview');
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
