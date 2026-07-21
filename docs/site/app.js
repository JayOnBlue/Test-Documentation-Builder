(function () {
  // ---------------- search modal ----------------
  var modal = document.getElementById('search-modal');
  var trigger = document.getElementById('search-trigger');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var index = window.__SEARCH_INDEX__ || [];
  var activeIndex = -1;
  var currentMatches = [];

  function renderResults(items) {
    currentMatches = items;
    activeIndex = items.length ? 0 : -1;
    if (!items.length) {
      results.innerHTML = '<div class="search-results__empty">No matching pages</div>';
      return;
    }
    results.innerHTML = items.slice(0, 8).map(function (item, i) {
      return '<a class="search-results__item' + (i === 0 ? ' search-results__item--active' : '') + '" href="' + item.url + '">' +
        '<span class="search-results__title">' + item.title + '</span>' +
        '<span class="search-results__desc">' + item.description + '</span>' +
        '</a>';
    }).join('');
  }

  function filterAndRender(q) {
    if (!q) { renderResults(index); return; }
    var query = q.toLowerCase();
    var matches = index.filter(function (item) {
      return (item.title + ' ' + item.description + ' ' + item.feature).toLowerCase().indexOf(query) !== -1;
    });
    renderResults(matches);
  }

  function openSearch() {
    if (!modal) return;
    modal.hidden = false;
    filterAndRender('');
    setTimeout(function () { input.focus(); }, 0);
  }
  function closeSearch() {
    if (!modal) return;
    modal.hidden = true;
    input.value = '';
  }

  if (trigger) trigger.addEventListener('click', openSearch);
  document.querySelectorAll('[data-close-search]').forEach(function (el) {
    el.addEventListener('click', closeSearch);
  });
  if (input) {
    input.addEventListener('input', function () { filterAndRender(input.value.trim()); });
    input.addEventListener('keydown', function (e) {
      var items = results.querySelectorAll('.search-results__item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === 'Enter') {
        if (items[activeIndex]) window.location.href = items[activeIndex].getAttribute('href');
        return;
      } else { return; }
      items.forEach(function (el, i) { el.classList.toggle('search-results__item--active', i === activeIndex); });
      if (items[activeIndex]) items[activeIndex].scrollIntoView({ block: 'nearest' });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape' && modal && !modal.hidden) {
      closeSearch();
    }
  });

  // ---------------- action bar (Copy for LLM / Markdown / View / URL / PDF) ----------------
  var rawDataEl = document.getElementById('raw-md-data');
  var rawData = null;
  try { rawData = rawDataEl ? JSON.parse(rawDataEl.textContent) : null; } catch (e) { rawData = null; }

  function flashLabel(btn, text) {
    var span = btn.querySelector('span:last-child') || btn;
    var original = btn.textContent;
    btn.dataset.original = btn.dataset.original || original;
    btn.innerHTML = btn.innerHTML.replace(/[^<]+$/, text);
    setTimeout(function () { btn.innerHTML = btn.innerHTML.replace(/[^<]+$/, btn.dataset.original.trim()); }, 1500);
  }

  function absoluteUrl(relativePath) {
    var base = window.location.href.replace(/[^/]+$/, '');
    return base + relativePath;
  }

  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!rawData) return;
      var action = btn.getAttribute('data-action');
      if (action === 'copy-llm') {
        var forLlm = '# ' + rawData.title + '\nSource: ' + absoluteUrl(rawData.url) + '\n\n' + rawData.markdown;
        navigator.clipboard.writeText(forLlm).then(function () { flashLabel(btn, 'Copied'); });
      } else if (action === 'copy-md') {
        navigator.clipboard.writeText(rawData.markdown).then(function () { flashLabel(btn, 'Copied'); });
      } else if (action === 'view-md') {
        window.open(rawData.rawUrl, '_blank');
      } else if (action === 'copy-url-md') {
        navigator.clipboard.writeText(absoluteUrl(rawData.rawUrl)).then(function () { flashLabel(btn, 'Copied'); });
      } else if (action === 'download-pdf') {
        window.print();
      }
    });
  });

  // ---------------- download / export docs (PDF or Word) ----------------
  var exportTrigger = document.getElementById('export-trigger');
  var exportModal = document.getElementById('export-modal');
  var exportRun = document.getElementById('export-run');
  var exportData = window.__DOCS_EXPORT__ || null;

  function openExport() { if (exportModal) exportModal.hidden = false; }
  function closeExport() { if (exportModal) exportModal.hidden = true; }
  if (exportTrigger) exportTrigger.addEventListener('click', openExport);
  document.querySelectorAll('[data-close-export]').forEach(function (el) { el.addEventListener('click', closeExport); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && exportModal && !exportModal.hidden) closeExport(); });

  var EXPORT_CSS = 'body{font-family:Georgia,\'Times New Roman\',serif;color:#1a1f36;line-height:1.6;max-width:760px;margin:40px auto;padding:0 24px;}' +
    'h1{font-family:Arial,sans-serif;font-size:26px;border-bottom:2px solid #635bff;padding-bottom:8px;margin:0 0 12px;}' +
    'h2{font-family:Arial,sans-serif;font-size:19px;margin:28px 0 8px;color:#1a1f36;}' +
    'h3{font-family:Arial,sans-serif;font-size:15px;margin:18px 0 6px;}' +
    '.lede{font-size:15px;color:#4b5563;font-style:italic;margin:0 0 16px;}' +
    'code{font-family:Consolas,monospace;font-size:90%;background:#f3f4f6;padding:1px 4px;border-radius:3px;}' +
    'pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto;}' +
    'ul,ol{padding-left:22px;}' +
    '.doc-note{color:#6b7280;font-style:italic;}' +
    '.cover{font-size:30px;} table{border-collapse:collapse;} td,th{border:1px solid #d5dae1;padding:6px 10px;}';

  function selectedPages(cat) {
    if (!exportData) return [];
    return cat === '__all__' ? exportData.pages : exportData.pages.filter(function (p) { return p.category === cat; });
  }

  // Strip ALL screenshot figures (relative image paths don't survive an exported file); leave a text note.
  function cleanHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('figure.screenshot').forEach(function (f) {
      var altEl = f.querySelector('.screenshot__alt') || f.querySelector('img');
      var alt = altEl ? (altEl.textContent || altEl.getAttribute('alt') || '') : '';
      var note = document.createElement('p');
      note.className = 'doc-note';
      note.textContent = alt ? '[Screenshot: ' + alt + ']' : '[Screenshot]';
      f.replaceWith(note);
    });
    return tmp.innerHTML;
  }

  function buildCombined(cat) {
    var list = selectedPages(cat);
    var title = cat === '__all__' ? (exportData.siteName || 'Documentation') : cat;
    var sep = '<div style="page-break-before:always"></div>';
    var body = list.map(function (p) {
      return '<section class="doc"><h1>' + p.title + '</h1>' +
        (p.description ? '<p class="lede">' + p.description + '</p>' : '') +
        cleanHtml(p.html) + '</section>';
    }).join(sep);
    return { title: title, count: list.length, body: body };
  }

  function downloadPdf(cat) {
    var c = buildCombined(cat);
    var w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups for this page so the PDF view can open, then use your browser\'s "Save as PDF".'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + c.title +
      '</title><style>' + EXPORT_CSS + '</style></head><body><h1 class="cover">' + c.title + '</h1>' + c.body + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 500);
  }

  function downloadDoc(cat) {
    var c = buildCombined(cat);
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>' + c.title + '</title><style>' + EXPORT_CSS + '</style></head><body>' +
      '<h1 class="cover">' + c.title + '</h1>' + c.body + '</body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var safe = (cat === '__all__' ? 'QuintEvents-Documentation' : cat).replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '');
    a.href = url; a.download = safe + '.doc';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  if (exportRun) {
    exportRun.addEventListener('click', function () {
      if (!exportData) { alert('Export data not loaded.'); return; }
      var cat = document.getElementById('export-category').value;
      var fmtEl = document.querySelector('input[name="export-format"]:checked');
      var fmt = fmtEl ? fmtEl.value : 'pdf';
      closeExport();
      if (fmt === 'doc') downloadDoc(cat); else downloadPdf(cat);
    });
  }

  // ---------------- copy buttons on code blocks ----------------
  document.querySelectorAll('.prose pre').forEach(function (pre) {
    if (pre.querySelector('.screenshot')) return;
    if (pre.closest('.changelog-entry__body')) return;
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code');
      var text = code ? code.textContent : pre.textContent;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      });
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  // ---------------- TOC scrollspy ----------------
  var tocLinks = document.querySelectorAll('.toc__list a');
  if (tocLinks.length) {
    var headingMap = [];
    tocLinks.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) headingMap.push({ el: el, link: a });
    });
    function onScroll() {
      var pos = window.scrollY + 96;
      var active = null;
      headingMap.forEach(function (h) { if (h.el.offsetTop <= pos) active = h; });
      tocLinks.forEach(function (a) { a.classList.remove('toc__list-active'); });
      if (active) active.link.classList.add('toc__list-active');
    }
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
