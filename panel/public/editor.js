/* Austin Mini Server — Editor File & Unduh Banyak File
   Author / Developer: Austin
   Editor multi-tab dengan syntax highlight, cari & ganti, Ctrl+S.
   Menggantikan openFileEditor() bawaan. Tanpa library eksternal. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var toast = function (m, t) { if (window.showToast) window.showToast(m, t || 'info'); };
  var post = function (u, b) {
    return window.api(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  };

  var LINE_H = 19;
  var HL_LIMIT = 250000;

  // ------------------------------------------------------------------
  // SYNTAX HIGHLIGHT
  // ------------------------------------------------------------------
  var set = function (s) { var o = {}; s.split(' ').forEach(function (w) { o[w] = 1; }); return o; };
  var KW = {
    js: set('const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false yield static get set delete void interface type enum implements public private protected readonly as'),
    py: set('def class return if elif else for while in not and or is import from as with try except finally raise lambda None True False pass break continue global nonlocal yield async await del assert self'),
    sh: set('if then else elif fi for while until do done case esac function in echo export local return exit cd set unset source read shift eval exec trap true false'),
    sql: set('select from where insert into values update set delete create table drop alter add column primary key foreign references index unique not null default and or in is like between join left right inner outer on group by order having limit offset as distinct union all case when then else end count sum avg min max'),
    yaml: set('true false null yes no on off')
  };

  function build(rules) {
    var src = rules.map(function (r) { return '(' + r[0] + ')'; }).join('|');
    var re = new RegExp(src, 'gm');
    return function (code) {
      var out = '', last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(code))) {
        if (m[0] === '') { re.lastIndex++; continue; }
        out += esc(code.slice(last, m.index));
        var gi = 0;
        for (var i = 1; i <= rules.length; i++) { if (m[i] !== undefined) { gi = i - 1; break; } }
        var cls = rules[gi][1];
        var end = m.index + m[0].length;
        if (typeof cls === 'function') cls = cls(m[0], code, end);
        if (cls && cls.html !== undefined) out += cls.html;
        else out += cls ? '<span class="tk-' + cls + '">' + esc(m[0]) + '</span>' : esc(m[0]);
        last = end;
      }
      return out + esc(code.slice(last));
    };
  }

  var STR = '"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'';
  var NUM = '\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b';

  function wordRule(kw, isCall) {
    return ['[A-Za-z_$][\\w$]*', function (w, code, end) {
      if (kw[w]) return 'k';
      if (isCall !== false && code.charAt(end) === '(') return 'f';
      if (/^[A-Z][A-Za-z0-9_]*$/.test(w) && w.length > 1) return 'cl';
      return null;
    }];
  }

  function htmlTag(t) {
    var s = esc(t);
    s = s.replace(/^(&lt;\/?)([A-Za-z][\w:-]*)/, '$1<span class="tk-t">$2</span>');
    s = s.replace(/([\w:@.-]+)(=)(&quot;(?:(?!&quot;)[\s\S])*&quot;|&#39;(?:(?!&#39;)[\s\S])*&#39;|[^\s&>]+)/g, '<span class="tk-a">$1</span>$2<span class="tk-s">$3</span>');
    return { html: s };
  }

  var LANGS = {
    js: build([
      ['\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', 'c'],
      [STR + '|`(?:\\\\.|[^`\\\\])*`', 's'],
      [NUM, 'n'],
      wordRule(KW.js)
    ]),
    json: build([
      ['"(?:\\\\.|[^"\\\\\\n])*"', function (w, code, end) {
        var i = end; while (code.charAt(i) === ' ' || code.charAt(i) === '\t') i++;
        return code.charAt(i) === ':' ? 'a' : 's';
      }],
      ['-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', 'n'],
      ['\\b(?:true|false|null)\\b', 'k']
    ]),
    py: build([
      ['#[^\\n]*', 'c'],
      ['"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|' + STR, 's'],
      ['@[A-Za-z_][\\w.]*', 'f'],
      [NUM, 'n'],
      wordRule(KW.py)
    ]),
    sh: build([
      ['(?:^|(?<=\\s))#[^\\n]*', 'c'],
      [STR, 's'],
      ['\\$\\{[^}\\n]*\\}|\\$[A-Za-z_]\\w*|\\$[0-9@#?!*$-]', 'v'],
      [NUM, 'n'],
      wordRule(KW.sh, false)
    ]),
    env: build([
      ['^[ \\t]*#[^\\n]*', 'c'],
      ['^[ \\t]*(?:export\\s+)?[A-Za-z_][\\w.-]*(?=\\s*[=:])', 'a'],
      [STR, 's'],
      ['\\$\\{[^}\\n]*\\}|\\$[A-Za-z_]\\w*', 'v'],
      [NUM, 'n']
    ]),
    yaml: build([
      ['(?:^|(?<=\\s))#[^\\n]*', 'c'],
      ['^[ \\t-]*[\\w.\\/-]+(?=\\s*:)', 'a'],
      [STR, 's'],
      [NUM, 'n'],
      ['\\b(?:true|false|null|yes|no|on|off)\\b', 'k']
    ]),
    css: build([
      ['\\/\\*[\\s\\S]*?\\*\\/', 'c'],
      [STR, 's'],
      ['@[\\w-]+', 'k'],
      ['#[0-9a-fA-F]{3,8}\\b', 'n'],
      ['-?\\d*\\.?\\d+(?:%|px|em|rem|vh|vw|s|ms|deg)?\\b', 'n'],
      ['[\\w-]+(?=\\s*:)', 'a'],
      ['[\\w-]+(?=\\()', 'f']
    ]),
    html: build([
      ['<!--[\\s\\S]*?-->', 'c'],
      ['<\\/?[A-Za-z][^>]*>', function (t) { return htmlTag(t); }],
      ['&[a-zA-Z#0-9]+;', 'n']
    ]),
    md: build([
      ['^```[\\s\\S]*?^```', 's'],
      ['^#{1,6}[^\\n]*', 'k'],
      ['`[^`\\n]+`', 's'],
      ['\\*\\*[^*\\n]+\\*\\*', 'f'],
      ['\\[[^\\]\\n]+\\]\\([^)\\n]+\\)', 'a']
    ]),
    sql: build([
      ['--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', 'c'],
      ["'(?:''|[^'])*'", 's'],
      [NUM, 'n'],
      ['[A-Za-z_]\\w*', function (w) { return KW.sql[w.toLowerCase()] ? 'k' : null; }]
    ])
  };

  var EXT = {
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', json: 'json', py: 'py',
    sh: 'sh', bash: 'sh', zsh: 'sh', env: 'env', css: 'css', scss: 'css', less: 'css',
    html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html', md: 'md', markdown: 'md',
    yml: 'yaml', yaml: 'yaml', toml: 'yaml', ini: 'yaml', conf: 'yaml', cfg: 'yaml', sql: 'sql'
  };
  var LANG_NAME = { js: 'JavaScript', json: 'JSON', py: 'Python', sh: 'Shell', env: 'ENV', css: 'CSS', html: 'HTML/XML', md: 'Markdown', yaml: 'YAML/INI', sql: 'SQL', text: 'Teks' };

  function langOf(name) {
    var n = name.toLowerCase();
    if (n === '.env' || n.indexOf('.env.') === 0) return 'env';
    if (n === 'dockerfile' || n === 'makefile') return 'sh';
    if (n === '.gitignore' || n === '.npmrc') return 'env';
    var i = n.lastIndexOf('.');
    return (i >= 0 && EXT[n.slice(i + 1)]) || 'text';
  }

  function highlight(code, lang) {
    if (!LANGS[lang] || code.length > HL_LIMIT) return esc(code);
    try { return LANGS[lang](code); } catch (e) { return esc(code); }
  }

  // ------------------------------------------------------------------
  // CSS
  // ------------------------------------------------------------------
  var css = document.createElement('style');
  css.textContent = [
    '#xe-modal{padding:0;align-items:stretch;justify-content:stretch;z-index:120}',
    '.xe-win{display:flex;flex-direction:column;width:100%;height:100%;background:var(--bg-base);min-height:0}',
    '.xe-top{display:flex;align-items:stretch;background:var(--bg-surface);border-bottom:1px solid var(--border-color);flex:0 0 auto}',
    '.xe-tabs{display:flex;overflow-x:auto;flex:1 1 auto;scrollbar-width:none}',
    '.xe-tabs::-webkit-scrollbar{display:none}',
    '.xe-tab{display:flex;align-items:center;gap:8px;padding:9px 12px;font-size:12.5px;font-family:var(--font-mono);color:var(--text-muted);border-right:1px solid var(--border-subtle);cursor:pointer;white-space:nowrap;max-width:220px;border-bottom:2px solid transparent}',
    '.xe-tab.active{color:var(--text-main);background:var(--bg-base);border-bottom-color:var(--accent-blue)}',
    '.xe-tab .nm{overflow:hidden;text-overflow:ellipsis}',
    '.xe-tab .dot{width:7px;height:7px;border-radius:50%;background:#F59E0B;flex:0 0 auto}',
    '.xe-tab .x{opacity:.6;font-size:12px;padding:0 2px}',
    '.xe-tab .x:hover{opacity:1;color:#F87171}',
    '.xe-tools{display:flex;align-items:center;gap:6px;padding:7px 10px;flex-wrap:wrap;background:var(--bg-surface);border-bottom:1px solid var(--border-subtle);flex:0 0 auto}',
    '.xe-tools .btn{padding:5px 10px;font-size:12px}',
    '.xe-meta{margin-left:auto;font-size:11.5px;color:var(--text-dim);font-family:var(--font-mono);white-space:nowrap}',
    '.xe-find{display:none;gap:6px;padding:7px 10px;flex-wrap:wrap;align-items:center;background:var(--bg-surface-elevated);border-bottom:1px solid var(--border-subtle);flex:0 0 auto}',
    '.xe-find.on{display:flex}',
    '.xe-find input[type=text]{background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-main);padding:5px 9px;font-size:12.5px;font-family:var(--font-mono);outline:none;flex:1 1 130px;min-width:90px}',
    '.xe-find input[type=text]:focus{border-color:var(--border-focus)}',
    '.xe-find .btn{padding:4px 9px;font-size:12px}',
    '.xe-find label{font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px;cursor:pointer}',
    '.xe-cnt{font-size:11.5px;color:var(--text-dim);font-family:var(--font-mono);min-width:54px}',
    '.xe-body{flex:1 1 auto;display:flex;min-height:0;background:var(--bg-input)}',
    '.xe-gut{flex:0 0 auto;min-width:44px;overflow:hidden;background:var(--bg-surface);border-right:1px solid var(--border-subtle);position:relative;user-select:none}',
    '.xe-gut>div{position:absolute;top:0;left:0;right:0;padding:10px 8px 0 6px;text-align:right;color:var(--text-dim);font:12.5px/' + LINE_H + 'px var(--font-mono);white-space:pre}',
    '.xe-area{position:relative;flex:1 1 auto;min-width:0;overflow:hidden}',
    '.xe-layer{position:absolute;inset:0;margin:0;overflow:hidden;pointer-events:none}',
    '.xe-layer>code{position:absolute;top:0;left:0;display:block;padding:10px 12px;font:12.5px/' + LINE_H + 'px var(--font-mono);white-space:pre;tab-size:2;color:#E2E8F0;will-change:transform}',
    '#xe-fl>code{color:transparent}',
    '#xe-fl mark{background:rgba(250,204,21,.22);color:transparent;border-radius:2px}',
    '#xe-fl mark.c{background:rgba(250,204,21,.55)}',
    '#xe-ta{position:absolute;inset:0;width:100%;height:100%;margin:0;border:0;outline:0;resize:none;background:transparent;color:transparent;caret-color:#F8FAFC;padding:10px 12px;font:12.5px/' + LINE_H + 'px var(--font-mono);white-space:pre;tab-size:2;overflow:auto;-webkit-text-fill-color:transparent;box-sizing:border-box}',
    '#xe-ta::selection{background:rgba(59,130,246,.4);-webkit-text-fill-color:transparent}',
    '.tk-c{color:#64748B;font-style:italic}.tk-s{color:#86EFAC}.tk-n{color:#FBBF24}.tk-k{color:#C084FC}',
    '.tk-f{color:#60A5FA}.tk-v{color:#F472B6}.tk-t{color:#F87171}.tk-a{color:#38BDF8}.tk-cl{color:#FCD34D}',
    '@media(max-width:600px){.xe-meta{display:none}.xe-gut{min-width:36px}}'
  ].join('\n');
  document.head.appendChild(css);

  // ------------------------------------------------------------------
  // STATE & DOM
  // ------------------------------------------------------------------
  var tabs = [];
  var active = -1;
  var built = false;
  var matches = [];
  var cur = -1;
  var rafId = 0;
  var charW = 7.5;
  var el = {};

  function buildUI() {
    if (built) return;
    built = true;
    var m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'xe-modal';
    m.innerHTML =
      '<div class="xe-win">' +
      '<div class="xe-top"><div class="xe-tabs" id="xe-tabs"></div>' +
      '<button class="btn btn-sm" id="xe-close" style="border-radius:0;border-width:0 0 0 1px;" title="Tutup editor">✕</button></div>' +
      '<div class="xe-tools">' +
      '<button class="btn btn-primary" id="xe-save">Simpan</button>' +
      '<button class="btn" id="xe-saveall">Simpan Semua</button>' +
      '<button class="btn" id="xe-findbtn">Cari / Ganti</button>' +
      '<span class="xe-meta" id="xe-meta"></span></div>' +
      '<div class="xe-find" id="xe-find">' +
      '<input type="text" id="xe-q" placeholder="Cari..." autocapitalize="off" spellcheck="false">' +
      '<input type="text" id="xe-r" placeholder="Ganti dengan..." autocapitalize="off" spellcheck="false">' +
      '<button class="btn" id="xe-prev" title="Sebelumnya">↑</button><button class="btn" id="xe-next" title="Berikutnya">↓</button>' +
      '<button class="btn" id="xe-rep">Ganti</button><button class="btn" id="xe-repall">Ganti Semua</button>' +
      '<label><input type="checkbox" id="xe-case"> Aa</label><label><input type="checkbox" id="xe-re"> Regex</label>' +
      '<span class="xe-cnt" id="xe-cnt"></span></div>' +
      '<div class="xe-body"><div class="xe-gut" id="xe-gut"><div id="xe-gn"></div></div>' +
      '<div class="xe-area"><pre class="xe-layer" id="xe-fl"><code id="xe-flc"></code></pre>' +
      '<pre class="xe-layer" id="xe-hl"><code id="xe-hlc"></code></pre>' +
      '<textarea id="xe-ta" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"></textarea></div></div></div>';
    document.body.appendChild(m);
    ['modal', 'tabs', 'meta', 'find', 'q', 'r', 'cnt', 'gut', 'gn', 'fl', 'flc', 'hl', 'hlc', 'ta'].forEach(function (k) {
      el[k] = document.getElementById(k === 'modal' ? 'xe-modal' : 'xe-' + k);
    });

    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:12.5px/19px var(--font-mono)';
    probe.textContent = new Array(101).join('M');
    document.body.appendChild(probe);
    var w = probe.getBoundingClientRect().width / 100;
    if (w > 3) charW = w;
    probe.remove();

    el.ta.addEventListener('input', onInput);
    el.ta.addEventListener('scroll', syncScroll);
    el.ta.addEventListener('keydown', onKey);
    ['keyup', 'click', 'focus'].forEach(function (ev) { el.ta.addEventListener(ev, updateMeta); });
    document.getElementById('xe-close').onclick = closeEditor;
    document.getElementById('xe-save').onclick = function () { saveTab(active); };
    document.getElementById('xe-saveall').onclick = saveAll;
    document.getElementById('xe-findbtn').onclick = toggleFind;
    document.getElementById('xe-next').onclick = function () { step(1); };
    document.getElementById('xe-prev').onclick = function () { step(-1); };
    document.getElementById('xe-rep').onclick = replaceOne;
    document.getElementById('xe-repall').onclick = replaceAll;
    el.q.addEventListener('input', function () { refind(true); });
    el.q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') toggleFind(false); });
    el.r.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') toggleFind(false); });
    document.getElementById('xe-case').onchange = function () { refind(true); };
    document.getElementById('xe-re').onchange = function () { refind(true); };

    el.tabs.addEventListener('click', function (e) {
      var x = e.target.closest('.x');
      var t = e.target.closest('.xe-tab');
      if (!t) return;
      var i = parseInt(t.getAttribute('data-i'), 10);
      if (x) closeTab(i); else activate(i);
    });

    document.addEventListener('keydown', function (e) {
      if (!el.modal.classList.contains('open')) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveTab(active); }
      else if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); toggleFind(true); }
    });
    window.addEventListener('beforeunload', function (e) {
      if (tabs.some(function (t) { return t.value !== t.orig; })) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  function curTab() { return tabs[active]; }

  function renderTabs() {
    el.tabs.innerHTML = tabs.map(function (t, i) {
      var dirty = t.value !== t.orig;
      return '<div class="xe-tab' + (i === active ? ' active' : '') + '" data-i="' + i + '" title="' + esc(t.path) + '">' +
        (dirty ? '<span class="dot"></span>' : '') + '<span class="nm">' + esc(t.name) + '</span><span class="x" title="Tutup">✕</span></div>';
    }).join('');
    var a = el.tabs.querySelector('.xe-tab.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderLayers() {
    var t = curTab();
    if (!t) return;
    el.hlc.innerHTML = highlight(t.value, t.lang) + '\n';
    var n = t.value.split('\n').length;
    var g = '';
    for (var i = 1; i <= n; i++) g += i + '\n';
    el.gn.textContent = g;
    el.gut.style.minWidth = Math.max(44, String(n).length * 9 + 22) + 'px';
    renderFind();
  }

  function renderFind() {
    var t = curTab();
    if (!t) return;
    if (!el.find.classList.contains('on') || !matches.length) {
      el.flc.innerHTML = '';
      return;
    }
    var v = t.value, out = '', last = 0;
    var cap = Math.min(matches.length, 2000);
    for (var i = 0; i < cap; i++) {
      var mt = matches[i];
      out += esc(v.slice(last, mt.i)) + '<mark' + (i === cur ? ' class="c"' : '') + '>' + esc(v.substr(mt.i, mt.len)) + '</mark>';
      last = mt.i + mt.len;
    }
    el.flc.innerHTML = out + esc(v.slice(last)) + '\n';
  }

  function syncScroll() {
    var x = el.ta.scrollLeft, y = el.ta.scrollTop;
    var tf = 'translate(' + (-x) + 'px,' + (-y) + 'px)';
    el.hlc.style.transform = tf;
    el.flc.style.transform = tf;
    el.gn.style.transform = 'translateY(' + (-y) + 'px)';
  }

  function updateMeta() {
    var t = curTab();
    if (!t) { el.meta.textContent = ''; return; }
    var pos = el.ta.selectionStart;
    var before = t.value.slice(0, pos);
    var ln = before.split('\n').length;
    var col = pos - before.lastIndexOf('\n');
    var lines = t.value.split('\n').length;
    el.meta.textContent = 'Ln ' + ln + ', Kol ' + col + ' • ' + lines + ' baris • ' + (LANG_NAME[t.lang] || 'Teks');
  }

  function scheduleRender() {
    if (rafId) return;
    rafId = setTimeout(function () {
      rafId = 0;
      renderLayers();
      syncScroll();
    }, 40);
  }

  // ------------------------------------------------------------------
  // TAB OPERATIONS
  // ------------------------------------------------------------------
  function activate(i) {
    var prev = curTab();
    if (prev) { prev.sl = el.ta.scrollLeft; prev.st = el.ta.scrollTop; prev.sel = [el.ta.selectionStart, el.ta.selectionEnd]; }
    active = i;
    var t = curTab();
    if (!t) { el.ta.value = ''; el.hlc.innerHTML = ''; el.gn.textContent = ''; renderTabs(); updateMeta(); return; }
    el.ta.value = t.value;
    renderLayers();
    renderTabs();
    el.ta.scrollLeft = t.sl || 0;
    el.ta.scrollTop = t.st || 0;
    syncScroll();
    if (t.sel) { try { el.ta.setSelectionRange(t.sel[0], t.sel[1]); } catch (e) {} }
    refind(false);
    updateMeta();
  }

  function openFile(path) {
    buildUI();
    var found = tabs.findIndex(function (t) { return t.path === path; });
    if (found >= 0) { el.modal.classList.add('open'); activate(found); el.ta.focus(); return Promise.resolve(); }
    return post('/api/files/content', { path: path }).then(function (res) {
      if (!res.ok) { toast(res.message || 'Gagal membuka file', 'error'); return; }
      var content = res.content || '';
      if (content.indexOf('\u0000') !== -1) { toast('File ini biner dan tidak bisa diedit sebagai teks.', 'error'); return; }
      var name = path.split(/[\\/]/).pop();
      tabs.push({ path: path, name: name, orig: content, value: content, lang: langOf(name) });
      el.modal.classList.add('open');
      activate(tabs.length - 1);
      el.ta.focus();
    }).catch(function () { toast('Error membuka editor', 'error'); });
  }

  function closeTab(i) {
    var t = tabs[i];
    if (!t) return;
    if (t.value !== t.orig && !window.confirm('"' + t.name + '" belum disimpan. Tutup tanpa menyimpan?')) return;
    if (i === active) { var p = curTab(); if (p) p.sel = null; }
    tabs.splice(i, 1);
    if (!tabs.length) { active = -1; el.modal.classList.remove('open'); el.ta.value = ''; return; }
    var next = i === active ? Math.min(i, tabs.length - 1) : (i < active ? active - 1 : active);
    active = -1;
    activate(next);
  }

  function closeEditor() {
    var dirty = tabs.filter(function (t) { return t.value !== t.orig; });
    if (dirty.length && !window.confirm(dirty.length + ' file belum disimpan. Tutup editor tanpa menyimpan?')) return;
    tabs = [];
    active = -1;
    matches = [];
    el.modal.classList.remove('open');
    el.ta.value = '';
  }

  function saveTab(i) {
    var t = tabs[i];
    if (!t) return Promise.resolve(false);
    var snapshot = t.value;
    return post('/api/files/save', { path: t.path, content: snapshot }).then(function (res) {
      if (res.ok) {
        t.orig = snapshot;
        renderTabs();
        toast('Tersimpan: ' + t.name, 'success');
        if (/\.(zip)$/i.test(t.name) === false && window.loadFiles && document.getElementById('tab-files').classList.contains('active')) window.loadFiles();
        return true;
      }
      toast(res.message || 'Gagal menyimpan', 'error');
      return false;
    }).catch(function () { toast('Error menyimpan file', 'error'); return false; });
  }

  function saveAll() {
    var dirty = [];
    tabs.forEach(function (t, i) { if (t.value !== t.orig) dirty.push(i); });
    if (!dirty.length) { toast('Tidak ada perubahan.'); return; }
    Promise.all(dirty.map(saveTab));
  }

  // ------------------------------------------------------------------
  // INPUT & KEYBOARD
  // ------------------------------------------------------------------
  function onInput() {
    var t = curTab();
    if (!t) return;
    var wasDirty = t.value !== t.orig;
    t.value = el.ta.value;
    if (wasDirty !== (t.value !== t.orig)) renderTabs();
    if (el.find.classList.contains('on')) refind(false);
    scheduleRender();
    updateMeta();
  }

  function fireInput() { el.ta.dispatchEvent(new Event('input')); }

  function onKey(e) {
    var ta = el.ta;
    if (e.key === 'Tab') {
      e.preventDefault();
      var s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (s === en && !e.shiftKey) {
        ta.setRangeText('  ', s, en, 'end');
      } else {
        var ls = v.lastIndexOf('\n', s - 1) + 1;
        var block = v.slice(ls, en);
        var lines = block.split('\n');
        var out = lines.map(function (l) { return e.shiftKey ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l; });
        var res = out.join('\n');
        ta.setRangeText(res, ls, en, 'preserve');
        ta.setSelectionRange(Math.max(ls, s + (e.shiftKey ? -Math.min(2, (lines[0].match(/^ {1,2}|^\t/) || [''])[0].length) : 2)), ls + res.length);
      }
      fireInput();
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      var p = ta.selectionStart, val = ta.value;
      var lineStart = val.lastIndexOf('\n', p - 1) + 1;
      var indent = (val.slice(lineStart, p).match(/^[ \t]*/) || [''])[0];
      var prevCh = val.charAt(p - 1);
      var extra = /[{[(]/.test(prevCh) ? '  ' : '';
      e.preventDefault();
      ta.setRangeText('\n' + indent + extra, p, ta.selectionEnd, 'end');
      fireInput();
    }
  }

  // ------------------------------------------------------------------
  // CARI & GANTI
  // ------------------------------------------------------------------
  function toggleFind(force) {
    var on = typeof force === 'boolean' ? force : !el.find.classList.contains('on');
    el.find.classList.toggle('on', on);
    if (on) {
      var sel = el.ta.value.slice(el.ta.selectionStart, el.ta.selectionEnd);
      if (sel && sel.indexOf('\n') === -1) el.q.value = sel;
      el.q.focus();
      el.q.select();
      refind(true);
    } else {
      matches = [];
      cur = -1;
      renderFind();
      el.ta.focus();
    }
  }

  function makeRegex(forReplace) {
    var q = el.q.value;
    if (!q) return null;
    var isRe = document.getElementById('xe-re').checked;
    var flags = 'g' + (document.getElementById('xe-case').checked ? '' : 'i');
    try { return new RegExp(isRe ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); } catch (e) { return null; }
  }

  function refind(jump) {
    var t = curTab();
    matches = [];
    if (!t || !el.find.classList.contains('on')) { renderFind(); return; }
    var re = makeRegex();
    if (el.q.value && !re) { el.cnt.textContent = 'regex salah'; renderFind(); return; }
    if (re) {
      var m, guard = 0;
      while ((m = re.exec(t.value)) && guard++ < 20000) {
        if (m[0] === '') { re.lastIndex++; continue; }
        matches.push({ i: m.index, len: m[0].length });
      }
    }
    if (!matches.length) { cur = -1; el.cnt.textContent = el.q.value ? '0 hasil' : ''; renderFind(); return; }
    if (jump) {
      var pos = el.ta.selectionStart;
      cur = matches.findIndex(function (x) { return x.i >= pos; });
      if (cur < 0) cur = 0;
      reveal();
    } else if (cur >= matches.length || cur < 0) {
      cur = 0;
    }
    el.cnt.textContent = (cur + 1) + '/' + matches.length;
    renderFind();
  }

  function reveal() {
    var t = curTab();
    var mt = matches[cur];
    if (!t || !mt) return;
    var before = t.value.slice(0, mt.i);
    var line = before.split('\n').length - 1;
    var col = mt.i - (before.lastIndexOf('\n') + 1);
    var top = line * LINE_H;
    var ta = el.ta;
    if (top < ta.scrollTop + LINE_H || top > ta.scrollTop + ta.clientHeight - LINE_H * 3) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    var left = col * charW;
    if (left < ta.scrollLeft || left > ta.scrollLeft + ta.clientWidth - 60) ta.scrollLeft = Math.max(0, left - ta.clientWidth / 3);
    try { ta.setSelectionRange(mt.i, mt.i + mt.len); } catch (e) {}
    syncScroll();
  }

  function step(dir) {
    if (!matches.length) { refind(true); return; }
    cur = (cur + dir + matches.length) % matches.length;
    el.cnt.textContent = (cur + 1) + '/' + matches.length;
    reveal();
    renderFind();
  }

  function replaceOne() {
    var t = curTab();
    if (!t || !matches.length || cur < 0) { refind(true); return; }
    var re = makeRegex();
    var mt = matches[cur];
    var piece = t.value.substr(mt.i, mt.len);
    var rep = el.r.value;
    var replacement = document.getElementById('xe-re').checked ? piece.replace(new RegExp(re.source, re.flags.replace('g', '')), rep) : rep;
    var at = mt.i;
    el.ta.value = t.value.slice(0, at) + replacement + t.value.slice(at + mt.len);
    el.ta.setSelectionRange(at + replacement.length, at + replacement.length);
    fireInput();
    refind(true);
  }

  function replaceAll() {
    var t = curTab();
    var re = makeRegex();
    if (!t || !re) return;
    var count = 0;
    var isRe = document.getElementById('xe-re').checked;
    var rep = el.r.value;
    var nv = t.value.replace(re, function () {
      count++;
      if (!isRe) return rep;
      var args = Array.prototype.slice.call(arguments);
      return rep.replace(/\$(\d+|&)/g, function (_, g) { return g === '&' ? args[0] : (args[parseInt(g, 10)] || ''); });
    });
    if (!count) { toast('Tidak ada yang diganti.'); return; }
    el.ta.value = nv;
    fireInput();
    refind(false);
    toast(count + ' kemunculan diganti.', 'success');
  }

  // ------------------------------------------------------------------
  // PASANG KE SISTEM
  // ------------------------------------------------------------------
  window.openFileEditor = function (path) { return openFile(path); };

  // ------------------------------------------------------------------
  // MULTI-SELECT DOWNLOAD DI FILE MANAGER
  // ------------------------------------------------------------------
  var selected = {};

  function selBar() {
    var bar = document.getElementById('xt-selbar');
    if (bar) return bar;
    var table = $('.fm-table');
    if (!table) return null;
    bar = document.createElement('div');
    bar.id = 'xt-selbar';
    bar.className = 'xt-sel-bar';
    bar.innerHTML = '<span id="xt-selcnt"></span><button class="btn btn-sm btn-primary" id="xt-seldl">Unduh ZIP</button>' +
      '<button class="btn btn-sm" id="xt-selall">Pilih semua</button><button class="btn btn-sm" id="xt-selclr">Batal</button>';
    var host = table.closest('.fm-table-wrap') || table.parentElement;
    host.parentElement.insertBefore(bar, host);
    document.getElementById('xt-seldl').onclick = downloadSelected;
    document.getElementById('xt-selall').onclick = function () {
      document.querySelectorAll('.xt-chk').forEach(function (c) { c.checked = true; selected[c.getAttribute('data-name')] = 1; });
      updateSel();
    };
    document.getElementById('xt-selclr').onclick = function () {
      selected = {};
      document.querySelectorAll('.xt-chk').forEach(function (c) { c.checked = false; });
      updateSel();
    };
    return bar;
  }

  function updateSel() {
    var bar = selBar();
    if (!bar) return;
    var n = Object.keys(selected).length;
    bar.classList.toggle('on', n > 0);
    document.getElementById('xt-selcnt').textContent = n + ' item dipilih';
  }

  function decorate() {
    selected = {};
    var rows = document.querySelectorAll('#fm-tbody tr');
    rows.forEach(function (tr) {
      var link = tr.querySelector('a[href^="/api/files/download"]');
      var cell = tr.querySelector('td');
      if (!link || !cell || cell.querySelector('.xt-chk')) return;
      var m = link.getAttribute('href').match(/path=([^&]+)/);
      if (!m) return;
      var full = decodeURIComponent(m[1]);
      var name = full.split(/[\\/]/).pop();
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'xt-chk';
      cb.setAttribute('data-name', name);
      cb.title = 'Pilih untuk unduh banyak file';
      cb.addEventListener('click', function (e) { e.stopPropagation(); });
      cb.addEventListener('change', function () {
        if (cb.checked) selected[name] = 1; else delete selected[name];
        updateSel();
      });
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';
      cell.insertBefore(cb, cell.firstChild);
    });
    updateSel();
  }

  function downloadSelected() {
    var names = Object.keys(selected);
    if (!names.length) return;
    var dir = typeof currentDir !== 'undefined' ? currentDir : '';
    var btn = document.getElementById('xt-seldl');
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';
    fetch('/api/files/zip-multi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: dir, names: names })
    }).then(function (res) {
      if (res.status === 401) throw new Error('Sesi habis, login ulang.');
      if (!res.ok) return res.json().then(function (j) { throw new Error(j.message || 'Gagal membuat ZIP'); });
      return res.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (dir.split(/[\\/]/).filter(Boolean).pop() || 'files') + '-terpilih.zip';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast(names.length + ' item diunduh sebagai ZIP.', 'success');
    }).catch(function (e) {
      toast(e.message, 'error');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Unduh ZIP';
    });
  }

  function hookFiles() {
    if (typeof window.loadFiles !== 'function' || window.loadFiles._xt) return;
    var orig = window.loadFiles;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      return Promise.resolve(r).then(function (v) { decorate(); return v; });
    };
    wrapped._xt = true;
    window.loadFiles = wrapped;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookFiles);
  else hookFiles();
})();
