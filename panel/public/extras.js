/* Austin Mini Server — Frontend Fitur Tambahan
   Author / Developer: Austin
   Tab Apps (deploy, .env, backup), Cron, Sistem (update, port, domain, PWA),
   penelusur log, dan registrasi PWA. Editor ada di editor.js. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var fmtBytes = function (b) {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  };
  var fmtDate = function (ms) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  var fmtUptime = function (ms) {
    if (!ms) return '-';
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return d ? d + 'h ' + h + 'j' : h ? h + 'j ' + m + 'm' : m + 'm';
  };
  var toast = function (m, t) { if (window.showToast) window.showToast(m, t || 'info'); };
  var jget = function (u) { return window.api(u); };
  var jpost = function (u, b) {
    return window.api(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  };
  var confirmBox = function (title, message, actionText, onConfirm) {
    window.showConceptConfirm({ title: title, message: message, actionText: actionText, onConfirm: onConfirm });
  };

  // ------------------------------------------------------------------
  // CSS
  // ------------------------------------------------------------------
  var css = document.createElement('style');
  css.textContent = [
    '.xt-pad{padding:14px 16px}',
    '.xt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}',
    '.xt-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border-subtle)}',
    '.xt-row:first-child{border-top:0}',
    '.xt-grow{flex:1 1 180px;min-width:0}',
    '.xt-name{font-weight:600;font-size:14px;color:var(--text-main);word-break:break-all}',
    '.xt-sub{font-size:12px;color:var(--text-dim);font-family:var(--font-mono);margin-top:2px;word-break:break-all}',
    '.xt-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:2px 9px;border-radius:9999px;background:rgba(148,163,184,.12);color:var(--text-muted)}',
    '.xt-badge.ok{background:rgba(16,185,129,.14);color:#34D399}',
    '.xt-badge.bad{background:rgba(239,68,68,.14);color:#F87171}',
    '.xt-badge.warn{background:rgba(245,158,11,.14);color:#FBBF24}',
    '.xt-btns{display:flex;gap:6px;flex-wrap:wrap}',
    '.xt-btns .btn{padding:5px 10px;font-size:12px}',
    '.xt-empty{padding:22px 16px;text-align:center;color:var(--text-dim);font-size:13px}',
    '.xt-hint{font-size:12px;color:var(--text-dim);line-height:1.5;margin-top:6px}',
    '.xt-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.xt-inline .form-input{width:auto;flex:1 1 120px}',
    '.xt-check{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-muted);cursor:pointer}',
    '.xt-pre{background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;font-family:var(--font-mono);font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto;color:#CBD5E1;margin:0}',
    '.xt-modal{max-width:560px;max-height:90vh;overflow:auto}',
    '.xt-modal.wide{max-width:760px}',
    '.xt-env-row{display:flex;gap:6px;margin-bottom:6px}',
    '.xt-env-row .form-input{font-family:var(--font-mono);font-size:12px;padding:7px 9px}',
    '.xt-env-row .k{flex:0 0 38%}',
    '.xt-env-row .v{flex:1 1 auto}',
    '.xt-sep{height:1px;background:var(--border-subtle);margin:14px 0}',
    '.xt-ver{font-family:var(--font-mono);font-size:13px;color:var(--text-main)}',
    '.xl-box{font-family:var(--font-mono);font-size:12px;line-height:1.5;height:300px;overflow:auto;background:var(--bg-input);padding:10px 12px;white-space:pre-wrap;word-break:break-word;border-top:1px solid var(--border-color)}',
    '.xl-box .ln{display:block}',
    '.xl-box .lv-error{color:#F87171}',
    '.xl-box .lv-warn{color:#FBBF24}',
    '.xl-box .lv-debug{color:#64748B}',
    '.xl-box mark{background:rgba(250,204,21,.35);color:#FEF08A;border-radius:2px;padding:0 1px}',
    '.xt-sel-bar{display:none;align-items:center;gap:8px;padding:8px 12px;margin-bottom:10px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.35);border-radius:8px;font-size:12.5px;color:#93C5FD}',
    '.xt-sel-bar.on{display:flex;flex-wrap:wrap}',
    '.xt-chk{width:16px;height:16px;accent-color:#3B82F6;cursor:pointer;margin-right:8px;vertical-align:middle;flex:0 0 auto}',
    '@media(max-width:600px){.xt-row{padding:12px}.xt-env-row{flex-wrap:wrap}.xt-env-row .k{flex:1 1 100%}}'
  ].join('\n');
  document.head.appendChild(css);

  // ------------------------------------------------------------------
  // MODAL HELPERS
  // ------------------------------------------------------------------
  function makeModal(id, title, bodyHtml, footerHtml, wide) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = id;
    el.innerHTML = '<div class="modal-box xt-modal' + (wide ? ' wide' : '') + '">' +
      '<h3 class="modal-title">' + esc(title) + '</h3>' +
      '<div class="xt-body">' + bodyHtml + '</div>' +
      '<div class="modal-footer" style="margin-top:14px;">' + (footerHtml || '') + '</div></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    return el;
  }

  function closeX(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }
  window.xtClose = closeX;

  function showJob(jobId, title, onDone) {
    var id = 'xt-job';
    makeModal(id, title,
      '<div id="xt-job-state" class="xt-hint" style="margin:0 0 8px;">Berjalan...</div><pre class="xt-pre" id="xt-job-log" style="height:260px;"></pre>',
      '<button class="btn btn-sm btn-primary" id="xt-job-close" disabled>Tutup</button>', true);
    var closeBtn = $('#xt-job-close');
    closeBtn.onclick = function () { closeX(id); };
    var stopped = false;
    function poll() {
      if (stopped || !document.getElementById(id)) return;
      jget('/api/ext/job?id=' + encodeURIComponent(jobId)).then(function (r) {
        var box = $('#xt-job-log');
        if (!box) return;
        var atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
        box.textContent = r.log || '';
        if (atBottom) box.scrollTop = box.scrollHeight;
        if (r.done) {
          stopped = true;
          $('#xt-job-state').textContent = r.success ? '✓ Selesai' : '✗ Selesai dengan error';
          $('#xt-job-state').style.color = r.success ? '#34D399' : '#F87171';
          closeBtn.disabled = false;
          if (onDone) onDone(r);
        } else {
          setTimeout(poll, 900);
        }
      }).catch(function () { setTimeout(poll, 1500); });
    }
    poll();
  }

  // ------------------------------------------------------------------
  // BUAT TAB & NAVIGASI
  // ------------------------------------------------------------------
  var ICON = {
    apps: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    cron: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    sys: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  function addTab(id, label, icon, html) {
    var nav = $('.tabs-nav');
    var btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.setAttribute('onclick', "switchTab('" + id + "')");
    btn.innerHTML = icon + ' ' + label;
    nav.appendChild(btn);

    var sec = document.createElement('section');
    sec.id = id;
    sec.className = 'tab-content';
    sec.innerHTML = html;
    var anchor = $('#tab-services');
    var last = anchor;
    while (last.nextElementSibling && last.nextElementSibling.classList.contains('tab-content')) last = last.nextElementSibling;
    last.after(sec);
    return sec;
  }

  var cardHead = function (title, color, actions) {
    return '<div class="log-card-header"><div class="log-card-title"><svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;color:' + color +
      ';"><circle cx="12" cy="12" r="9"/></svg><span>' + title + '</span></div><div class="fm-actions">' + (actions || '') + '</div></div>';
  };

  // ------------------------------------------------------------------
  // TAB APPS
  // ------------------------------------------------------------------
  var appsHtml =
    '<div class="log-card">' + cardHead('Deploy App Baru', '#3B82F6') +
    '<div class="xt-pad">' +
    '<div class="xt-grid">' +
    '<div><label class="form-label">Nama app</label><input class="form-input" id="xa-name" placeholder="bot-toko" maxlength="40" autocapitalize="off"></div>' +
    '<div><label class="form-label">File start (opsional)</label><input class="form-input" id="xa-start" placeholder="index.js" autocapitalize="off"></div>' +
    '<div><label class="form-label">Port (opsional)</label><input class="form-input" id="xa-port" type="number" min="1" max="65535" placeholder="3000"></div>' +
    '</div>' +
    '<label class="form-label">File ZIP project</label>' +
    '<div class="xt-inline"><input class="form-input" id="xa-zip" type="file" accept=".zip"></div>' +
    '<div class="xt-inline" style="margin-top:12px;justify-content:space-between;">' +
    '<label class="xt-check"><input type="checkbox" id="xa-overwrite"> Timpa jika app sudah ada</label>' +
    '<button class="btn btn-primary" id="xa-deploy">Deploy</button></div>' +
    '<div class="xt-hint">Proses: ekstrak ZIP → <code>npm install</code> (jika ada package.json) → jalan lewat PM2. Variabel <code>PORT</code> dan isi <code>.env</code> otomatis diteruskan ke app.</div>' +
    '</div></div>' +

    '<div class="log-card">' + cardHead('Daftar App', '#10B981', '<button class="btn btn-sm btn-action-blue" id="xa-refresh">Refresh</button>') +
    '<div id="xa-list"><div class="xt-empty">Memuat...</div></div></div>' +

    '<div class="log-card">' + cardHead('Backup & Restore', '#F59E0B') +
    '<div class="xt-pad">' +
    '<div class="xt-inline"><select class="form-input" id="xb-target"></select>' +
    '<button class="btn btn-primary btn-sm" id="xb-create">Buat Backup</button></div>' +
    '<div class="xt-hint">node_modules tidak disertakan (dipasang ulang otomatis saat restore).</div>' +
    '<div class="xt-sep"></div>' +
    '<div class="form-label" style="margin-bottom:8px;">Backup otomatis</div>' +
    '<div class="xt-inline">' +
    '<label class="xt-check"><input type="checkbox" id="xb-auto"> Aktif</label>' +
    '<input class="form-input" id="xb-time" type="time" value="03:00" style="flex:0 0 110px;">' +
    '<select class="form-input" id="xb-auto-target" style="flex:1 1 130px;"></select>' +
    '<input class="form-input" id="xb-keep" type="number" min="1" max="50" value="5" title="Jumlah backup otomatis yang disimpan" style="flex:0 0 80px;">' +
    '<button class="btn btn-sm" id="xb-save">Simpan</button></div>' +
    '<div class="xt-hint">Angka di kanan = jumlah backup otomatis yang disimpan; yang lebih lama dihapus.</div>' +
    '</div><div id="xb-list" style="border-top:1px solid var(--border-color);"></div></div>';

  var appsCache = [];
  var appsDir = '';

  function loadApps() {
    jget('/api/apps/list').then(function (r) {
      if (!r.ok) return;
      appsCache = r.apps;
      appsDir = r.appsDir;
      var box = $('#xa-list');
      if (!r.apps.length) {
        box.innerHTML = '<div class="xt-empty">Belum ada app. Upload ZIP project di atas untuk memulai.</div>';
      } else {
        box.innerHTML = r.apps.map(function (a) {
          var badge = a.running ? '<span class="xt-badge ok">● online</span>'
            : a.status === 'belum jalan' ? '<span class="xt-badge">belum jalan</span>'
            : '<span class="xt-badge bad">● ' + esc(a.status) + '</span>';
          var sub = [a.port ? 'port ' + a.port : null, a.running ? fmtBytes(a.memory) : null, a.running ? 'up ' + fmtUptime(a.uptime) : null, a.restarts ? a.restarts + '× restart' : null, a.hasEnv ? '.env' : null]
            .filter(Boolean).join(' • ');
          var n = esc(a.name);
          return '<div class="xt-row"><div class="xt-grow"><div class="xt-name">' + n + ' ' + badge + '</div><div class="xt-sub">' + (sub || '-') + '</div></div>' +
            '<div class="xt-btns">' +
            '<button class="btn" data-a="' + (a.running ? 'restart' : 'start') + '" data-n="' + n + '">' + (a.running ? 'Restart' : 'Start') + '</button>' +
            (a.running ? '<button class="btn" data-a="stop" data-n="' + n + '">Stop</button>' : '') +
            '<button class="btn" data-a="env" data-n="' + n + '">.env</button>' +
            '<button class="btn" data-a="logs" data-n="' + n + '">Log</button>' +
            '<button class="btn" data-a="files" data-n="' + n + '">File</button>' +
            '<button class="btn" data-a="cfg" data-n="' + n + '">Atur</button>' +
            '<button class="btn" data-a="backup" data-n="' + n + '">Backup</button>' +
            '<button class="btn btn-action-red" data-a="del" data-n="' + n + '">Hapus</button>' +
            '</div></div>';
        }).join('');
      }
      var opts = '<option value="all">Semua app</option>' + r.apps.map(function (a) { return '<option value="' + esc(a.name) + '">' + esc(a.name) + '</option>'; }).join('');
      ['xb-target', 'xb-auto-target'].forEach(function (id) {
        var s = document.getElementById(id);
        if (!s) return;
        var cur = s.value;
        s.innerHTML = opts;
        if (cur) s.value = cur;
      });
    }).catch(function () {});
    loadBackups();
  }

  function appAction(action, name) {
    if (action === 'start' || action === 'restart' || action === 'stop') {
      toast((action === 'stop' ? 'Menghentikan ' : 'Menjalankan ') + name + '...');
      jpost('/api/apps/action', { name: name, action: action }).then(function (r) {
        toast(r.message, r.ok ? 'success' : 'error');
        loadApps();
      });
    } else if (action === 'logs') {
      window.switchTab('tab-services');
      setTimeout(function () { if (window.showPm2Logs) window.showPm2Logs(name); }, 400);
    } else if (action === 'files') {
      window.switchTab('tab-files');
      window.loadFiles(appsDir + '/' + name);
    } else if (action === 'env') {
      openEnv(name);
    } else if (action === 'cfg') {
      openAppCfg(name);
    } else if (action === 'backup') {
      jpost('/api/backups/create', { target: name }).then(function (r) {
        if (r.ok) showJob(r.jobId, 'Backup ' + name, loadBackups); else toast(r.message, 'error');
      });
    } else if (action === 'del') {
      var m = makeModal('xt-del', 'Hapus app ' + name,
        '<p style="font-size:13px;color:var(--text-muted);margin:0 0 12px;">App akan dihentikan dan dihapus dari PM2.</p>' +
        '<label class="xt-check"><input type="checkbox" id="xt-del-files"> Hapus juga semua file app (tidak bisa dibatalkan)</label>',
        '<button class="btn btn-sm" onclick="xtClose(\'xt-del\')">Batal</button><button class="btn btn-sm btn-danger" id="xt-del-ok">Hapus</button>');
      $('#xt-del-ok', m).onclick = function () {
        var rm = $('#xt-del-files', m).checked;
        closeX('xt-del');
        jpost('/api/apps/action', { name: name, action: 'delete', removeFiles: rm }).then(function (r) {
          toast(r.message, r.ok ? 'success' : 'error');
          loadApps();
        });
      };
    }
  }

  function openEnv(name) {
    jget('/api/apps/env?name=' + encodeURIComponent(name)).then(function (r) {
      if (!r.ok) { toast(r.message, 'error'); return; }
      var rows = r.env.length ? r.env : [{ key: '', value: '' }];
      var m = makeModal('xt-env', '.env — ' + name,
        '<div id="xt-env-rows"></div>' +
        '<button class="btn btn-sm" id="xt-env-add" style="margin-top:4px;">+ Tambah variabel</button>' +
        '<div class="xt-hint">Nilai disembunyikan; klik ikon mata untuk melihat. File disimpan sebagai <code>.env</code> di folder app dan diteruskan ke proses saat start/restart.</div>',
        '<button class="btn btn-sm" onclick="xtClose(\'xt-env\')">Batal</button>' +
        '<button class="btn btn-sm" id="xt-env-save">Simpan</button>' +
        '<button class="btn btn-sm btn-primary" id="xt-env-saver">Simpan & Restart</button>', true);
      var wrap = $('#xt-env-rows', m);
      function addRow(k, v) {
        var d = document.createElement('div');
        d.className = 'xt-env-row';
        d.innerHTML = '<input class="form-input k" placeholder="NAMA_VARIABEL" autocapitalize="off" spellcheck="false">' +
          '<input class="form-input v" type="password" placeholder="nilai" autocomplete="off" spellcheck="false">' +
          '<button class="btn btn-sm" type="button" title="Tampilkan">👁</button>' +
          '<button class="btn btn-sm btn-action-red" type="button" title="Hapus">✕</button>';
        $('.k', d).value = k || '';
        $('.v', d).value = v || '';
        var bs = $$('button', d);
        bs[0].onclick = function () { var i = $('.v', d); i.type = i.type === 'password' ? 'text' : 'password'; };
        bs[1].onclick = function () { d.remove(); };
        wrap.appendChild(d);
      }
      rows.forEach(function (p) { addRow(p.key, p.value); });
      $('#xt-env-add', m).onclick = function () { addRow('', ''); };
      function collect() {
        return $$('.xt-env-row', wrap).map(function (d) { return { key: $('.k', d).value.trim(), value: $('.v', d).value }; }).filter(function (p) { return p.key; });
      }
      function save(restart) {
        jpost('/api/apps/env', { name: name, env: collect(), restart: restart }).then(function (r2) {
          toast(r2.message, r2.ok ? 'success' : 'error');
          if (r2.ok) { closeX('xt-env'); loadApps(); }
        });
      }
      $('#xt-env-save', m).onclick = function () { save(false); };
      $('#xt-env-saver', m).onclick = function () { save(true); };
    });
  }

  function openAppCfg(name) {
    var a = appsCache.find(function (x) { return x.name === name; }) || {};
    var m = makeModal('xt-cfg', 'Pengaturan — ' + name,
      '<div class="form-group"><label class="form-label">File start (kosong = otomatis dari package.json / index.js)</label><input class="form-input" id="xt-cfg-start" value="' + esc(a.startFile || '') + '" autocapitalize="off"></div>' +
      '<div class="form-group"><label class="form-label">Port (diteruskan sebagai variabel PORT)</label><input class="form-input" id="xt-cfg-port" type="number" value="' + esc(a.port || '') + '"></div>' +
      '<div class="xt-hint">Berlaku saat app dijalankan ulang. Untuk menerapkan file start baru, hapus dari PM2 lalu Start lagi.</div>',
      '<button class="btn btn-sm" onclick="xtClose(\'xt-cfg\')">Batal</button><button class="btn btn-sm btn-primary" id="xt-cfg-ok">Simpan</button>');
    $('#xt-cfg-ok', m).onclick = function () {
      jpost('/api/apps/meta', { name: name, startFile: $('#xt-cfg-start', m).value, port: $('#xt-cfg-port', m).value }).then(function (r) {
        toast(r.message, r.ok ? 'success' : 'error');
        if (r.ok) { closeX('xt-cfg'); loadApps(); }
      });
    };
  }

  function doDeploy() {
    var name = $('#xa-name').value.trim();
    var file = $('#xa-zip').files[0];
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) { toast('Nama app: huruf, angka, _ atau - (maks 40).', 'error'); return; }
    if (!file) { toast('Pilih file ZIP project dulu.', 'error'); return; }
    var btn = $('#xa-deploy');
    btn.disabled = true;
    btn.textContent = 'Mengupload...';
    var fd = new FormData();
    fd.append('file', file, file.name);
    fetch('/api/apps/upload', { method: 'POST', body: fd }).then(function (res) {
      if (res.status === 401) { throw new Error('Sesi habis, login ulang.'); }
      return res.json();
    }).then(function (up) {
      if (!up.ok) throw new Error(up.message || 'Upload gagal');
      return jpost('/api/apps/deploy', {
        name: name, zipPath: up.zipPath, startFile: $('#xa-start').value.trim(),
        port: $('#xa-port').value, overwrite: $('#xa-overwrite').checked
      });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.message || 'Deploy gagal');
      showJob(r.jobId, 'Deploy ' + name, function () { loadApps(); });
    }).catch(function (e) {
      toast(e.message, 'error');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Deploy';
    });
  }

  function loadBackups() {
    jget('/api/backups/list').then(function (r) {
      if (!r.ok) return;
      var s = r.schedule || {};
      var ae = $('#xb-auto');
      if (ae && document.activeElement !== ae) {
        ae.checked = !!s.enabled;
        $('#xb-time').value = s.time || '03:00';
        $('#xb-keep').value = s.keep || 5;
        var t = $('#xb-auto-target');
        if (t && s.target) t.value = s.target;
      }
      var box = $('#xb-list');
      if (!box) return;
      if (!r.backups.length) { box.innerHTML = '<div class="xt-empty">Belum ada backup.</div>'; return; }
      box.innerHTML = r.backups.map(function (b) {
        var f = esc(b.file);
        return '<div class="xt-row"><div class="xt-grow"><div class="xt-name" style="font-size:13px;">' + f + (b.auto ? ' <span class="xt-badge">otomatis</span>' : '') +
          '</div><div class="xt-sub">' + fmtBytes(b.size) + ' • ' + fmtDate(b.modifiedAt) + '</div></div>' +
          '<div class="xt-btns"><a class="btn" href="/api/backups/download?file=' + encodeURIComponent(b.file) + '" download>Unduh</a>' +
          '<button class="btn" data-b="restore" data-f="' + f + '">Restore</button>' +
          '<button class="btn btn-action-red" data-b="del" data-f="' + f + '">Hapus</button></div></div>';
      }).join('');
    }).catch(function () {});
  }

  function bindApps(sec) {
    $('#xa-deploy', sec).onclick = doDeploy;
    $('#xa-refresh', sec).onclick = loadApps;
    $('#xa-list', sec).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-a]');
      if (b) appAction(b.getAttribute('data-a'), b.getAttribute('data-n'));
    });
    $('#xb-create', sec).onclick = function () {
      var target = $('#xb-target').value;
      jpost('/api/backups/create', { target: target }).then(function (r) {
        if (r.ok) showJob(r.jobId, 'Backup', loadBackups); else toast(r.message, 'error');
      });
    };
    $('#xb-save', sec).onclick = function () {
      jpost('/api/backups/schedule', {
        enabled: $('#xb-auto').checked, time: $('#xb-time').value,
        target: $('#xb-auto-target').value, keep: $('#xb-keep').value
      }).then(function (r) { toast(r.message, r.ok ? 'success' : 'error'); });
    };
    $('#xb-list', sec).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-b]');
      if (!b) return;
      var f = b.getAttribute('data-f');
      if (b.getAttribute('data-b') === 'del') {
        confirmBox('Hapus backup', 'Hapus ' + f + '?', 'Hapus', function () {
          jpost('/api/backups/delete', { file: f }).then(function (r) { toast(r.message, r.ok ? 'success' : 'error'); loadBackups(); });
        });
      } else {
        confirmBox('Restore backup', 'Timpa file app dengan isi ' + f + '? File yang namanya sama akan diganti.', 'Restore', function () {
          jpost('/api/backups/restore', { file: f }).then(function (r) {
            if (r.ok) showJob(r.jobId, 'Restore', loadApps); else toast(r.message, 'error');
          });
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // TAB CRON
  // ------------------------------------------------------------------
  var cronHtml =
    '<div class="log-card">' + cardHead('Cron Manager', '#8B5CF6',
      '<button class="btn btn-sm btn-primary" id="xc-add">+ Tambah Job</button><button class="btn btn-sm btn-action-blue" id="xc-refresh">Refresh</button>') +
    '<div id="xc-tz" class="xt-hint" style="padding:8px 16px 0;margin:0;"></div>' +
    '<div id="xc-list"><div class="xt-empty">Memuat...</div></div></div>' +
    '<div class="log-card">' + cardHead('Log Cron', '#94A3B8', '<button class="btn btn-sm" id="xc-log-refresh">Refresh</button>') +
    '<div class="xl-box" id="xc-log" style="height:220px;"></div></div>';

  var PRESETS = [
    ['Setiap menit', '* * * * *'], ['Setiap 5 menit', '*/5 * * * *'], ['Setiap 15 menit', '*/15 * * * *'],
    ['Setiap jam', '0 * * * *'], ['Setiap hari 00:00', '0 0 * * *'], ['Setiap hari 03:00', '0 3 * * *'],
    ['Setiap Senin 08:00', '0 8 * * 1'], ['Tanggal 1 tiap bulan', '0 0 1 * *']
  ];

  function loadCron() {
    jget('/api/cron/list').then(function (r) {
      if (!r.ok) return;
      $('#xc-tz').textContent = 'Zona waktu server: ' + r.timezone + ' • Format: menit jam tanggal bulan hari';
      var box = $('#xc-list');
      if (!r.jobs.length) { box.innerHTML = '<div class="xt-empty">Belum ada job terjadwal.</div>'; }
      else {
        box.innerHTML = r.jobs.map(function (j) {
          var st = j.running ? '<span class="xt-badge warn">berjalan</span>'
            : j.lastStatus === 'ok' ? '<span class="xt-badge ok">terakhir OK</span>'
            : j.lastStatus ? '<span class="xt-badge bad">terakhir gagal</span>' : '<span class="xt-badge">belum pernah jalan</span>';
          return '<div class="xt-row" style="' + (j.enabled ? '' : 'opacity:.55;') + '"><div class="xt-grow">' +
            '<div class="xt-name">' + esc(j.name) + ' ' + st + '</div>' +
            '<div class="xt-sub">' + esc(j.schedule) + ' • ' + esc(j.command.length > 70 ? j.command.slice(0, 70) + '…' : j.command) + '</div>' +
            '<div class="xt-sub">Berikutnya: ' + (j.enabled ? fmtDate(j.nextRun) : 'nonaktif') + ' • Terakhir: ' + fmtDate(j.lastRun) + (j.lastDurationMs ? ' (' + j.lastDurationMs + 'ms)' : '') + '</div></div>' +
            '<div class="xt-btns">' +
            '<button class="btn" data-c="run" data-id="' + j.id + '">Jalankan</button>' +
            '<button class="btn" data-c="out" data-id="' + j.id + '">Output</button>' +
            '<button class="btn" data-c="toggle" data-id="' + j.id + '" data-on="' + (j.enabled ? 1 : 0) + '">' + (j.enabled ? 'Matikan' : 'Aktifkan') + '</button>' +
            '<button class="btn" data-c="edit" data-id="' + j.id + '">Edit</button>' +
            '<button class="btn btn-action-red" data-c="del" data-id="' + j.id + '">Hapus</button></div></div>';
        }).join('');
      }
      box._jobs = r.jobs;
    }).catch(function () {});
    loadCronLog();
  }

  function loadCronLog() {
    jget('/api/cron/log').then(function (r) {
      var b = $('#xc-log');
      if (!b) return;
      b.textContent = r.log || 'Belum ada aktivitas.';
      b.scrollTop = b.scrollHeight;
    }).catch(function () {});
  }

  function openCronForm(job) {
    job = job || { name: '', schedule: '*/5 * * * *', command: '', cwd: '', timeoutSec: 300, enabled: true };
    var m = makeModal('xt-cronf', job.id ? 'Edit Job' : 'Job Baru',
      '<div class="form-group"><label class="form-label">Nama</label><input class="form-input" id="xcf-name" maxlength="60" value="' + esc(job.name) + '"></div>' +
      '<div class="form-group"><label class="form-label">Jadwal</label>' +
      '<select class="form-input" id="xcf-preset" style="margin-bottom:6px;"><option value="">— pilih preset —</option>' +
      PRESETS.map(function (p) { return '<option value="' + p[1] + '">' + p[0] + ' (' + p[1] + ')</option>'; }).join('') + '</select>' +
      '<input class="form-input" id="xcf-sched" style="font-family:var(--font-mono);" value="' + esc(job.schedule) + '" placeholder="*/5 * * * *"></div>' +
      '<div class="form-group"><label class="form-label">Perintah (dijalankan dengan shell)</label><textarea class="form-input" id="xcf-cmd" rows="3" style="font-family:var(--font-mono);font-size:12px;">' + esc(job.command) + '</textarea></div>' +
      '<div class="xt-grid"><div><label class="form-label">Folder kerja (opsional)</label><input class="form-input" id="xcf-cwd" value="' + esc(job.cwd || '') + '" placeholder="folder utama server"></div>' +
      '<div><label class="form-label">Batas waktu (detik)</label><input class="form-input" id="xcf-to" type="number" min="5" max="3600" value="' + esc(job.timeoutSec || 300) + '"></div></div>' +
      '<label class="xt-check"><input type="checkbox" id="xcf-en" ' + (job.enabled !== false ? 'checked' : '') + '> Aktif</label>',
      '<button class="btn btn-sm" onclick="xtClose(\'xt-cronf\')">Batal</button><button class="btn btn-sm btn-primary" id="xcf-ok">Simpan</button>');
    $('#xcf-preset', m).onchange = function () { if (this.value) $('#xcf-sched', m).value = this.value; };
    $('#xcf-ok', m).onclick = function () {
      jpost('/api/cron/save', {
        id: job.id, name: $('#xcf-name', m).value, schedule: $('#xcf-sched', m).value, command: $('#xcf-cmd', m).value,
        cwd: $('#xcf-cwd', m).value, timeoutSec: $('#xcf-to', m).value, enabled: $('#xcf-en', m).checked
      }).then(function (r) {
        toast(r.message, r.ok ? 'success' : 'error');
        if (r.ok) { closeX('xt-cronf'); loadCron(); }
      });
    };
  }

  function bindCron(sec) {
    $('#xc-add', sec).onclick = function () { openCronForm(); };
    $('#xc-refresh', sec).onclick = loadCron;
    $('#xc-log-refresh', sec).onclick = loadCronLog;
    $('#xc-list', sec).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-c]');
      if (!b) return;
      var id = b.getAttribute('data-id');
      var jobs = $('#xc-list')._jobs || [];
      var job = jobs.find(function (j) { return j.id === id; });
      var act = b.getAttribute('data-c');
      if (act === 'run') {
        jpost('/api/cron/run', { id: id }).then(function (r) { toast(r.message, r.ok ? 'success' : 'error'); setTimeout(loadCron, 1500); });
      } else if (act === 'toggle') {
        jpost('/api/cron/toggle', { id: id, enabled: b.getAttribute('data-on') !== '1' }).then(loadCron);
      } else if (act === 'edit') {
        openCronForm(job);
      } else if (act === 'out') {
        makeModal('xt-cout', 'Output terakhir — ' + (job ? job.name : ''),
          '<pre class="xt-pre">' + esc((job && job.lastOutput) || '(belum ada output)') + '</pre>',
          '<button class="btn btn-sm btn-primary" onclick="xtClose(\'xt-cout\')">Tutup</button>', true);
      } else if (act === 'del') {
        confirmBox('Hapus job', 'Hapus job "' + (job ? job.name : '') + '"?', 'Hapus', function () {
          jpost('/api/cron/delete', { id: id }).then(function (r) { toast(r.message, 'info'); loadCron(); });
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // TAB SISTEM (Update, Port, Domain, PWA)
  // ------------------------------------------------------------------
  var sysHtml =
    '<div class="log-card">' + cardHead('Pembaruan Server', '#10B981', '<button class="btn btn-sm btn-action-blue" id="xs-check">Cek Update</button>') +
    '<div class="xt-pad"><div class="xt-inline" style="justify-content:space-between;">' +
    '<div>Versi terpasang: <span class="xt-ver" id="xs-local">-</span></div><div id="xs-remote-wrap">Versi terbaru: <span class="xt-ver" id="xs-remote">-</span></div></div>' +
    '<div id="xs-msg" class="xt-hint"></div><pre class="xt-pre" id="xs-change" style="display:none;margin-top:10px;max-height:180px;"></pre>' +
    '<div style="margin-top:12px;"><button class="btn btn-primary btn-sm" id="xs-run" style="display:none;">Update Sekarang</button></div>' +
    '<pre class="xt-pre" id="xs-log" style="display:none;margin-top:10px;max-height:200px;"></pre></div></div>' +

    '<div class="log-card">' + cardHead('Tunnel & Domain', '#3B82F6', '<button class="btn btn-sm btn-action-blue" id="xs-reconn">Ganti URL Tunnel</button>') +
    '<div class="xt-pad"><div class="form-label">URL publik panel (Cloudflare Tunnel)</div>' +
    '<div class="xt-inline"><input class="form-input secret-val" id="xs-pub" readonly value="-" data-secret="sys-pub" data-kind="url" data-placeholder="-" style="font-family:var(--font-mono);font-size:12px;">' +
    '<button type="button" class="btn btn-sm eye-btn" data-eye="sys-pub" title="Tampilkan" aria-pressed="false">' + window.Secret.EYE_SVG + '</button>' +
    '<button class="btn btn-sm" id="xs-pub-copy">Salin</button><button class="btn btn-sm" id="xs-pub-open">Buka</button></div>' +
    '<div class="xt-hint" id="xs-pub-state"></div>' +
    '<div class="xt-sep"></div><div class="form-label">Domain → port (untuk Cloudflare Named Tunnel)</div>' +
    '<div id="xs-dom"></div>' +
    '<div class="xt-inline" style="margin-top:8px;"><input class="form-input" id="xs-dom-host" placeholder="app.domainkamu.com" autocapitalize="off">' +
    '<input class="form-input" id="xs-dom-port" type="number" placeholder="port" style="flex:0 0 90px;">' +
    '<button class="btn btn-sm" id="xs-dom-add">Tambah</button></div>' +
    '<div class="xt-inline" style="margin-top:10px;"><button class="btn btn-sm btn-primary" id="xs-dom-save">Simpan</button><button class="btn btn-sm" id="xs-dom-yaml">Buat config cloudflared</button></div>' +
    '<div class="xt-hint">URL trycloudflare berubah setiap tunnel dihubungkan ulang. Untuk domain tetap, pakai Named Tunnel dan tempel config yang dihasilkan ke <code>~/.cloudflared/config.yml</code>.</div>' +
    '</div></div>' +

    '<div class="log-card">' + cardHead('Port Terbuka', '#F59E0B', '<button class="btn btn-sm btn-action-amber" id="xs-ports-refresh">Refresh</button>') +
    '<div id="xs-ports"><div class="xt-empty">Memuat...</div></div></div>' +

    '<div class="log-card">' + cardHead('Aplikasi (PWA)', '#8B5CF6') +
    '<div class="xt-pad"><div class="xt-hint" style="margin:0 0 10px;" id="xs-pwa-state">Memeriksa...</div>' +
    '<button class="btn btn-primary btn-sm" id="xs-pwa-install" style="display:none;">Pasang di layar utama</button></div></div>';

  var domains = [];

  function renderDomains() {
    var box = $('#xs-dom');
    if (!box) return;
    window.Secret.reset('dom-');
    box.innerHTML = domains.length ? domains.map(function (d, i) {
      return '<div class="xt-inline" style="margin-bottom:6px;"><span class="xt-sub" style="margin:0;flex:1;"><span class="secret-val" data-secret="dom-' + i + '" data-kind="host"></span> → localhost:' + esc(d.port) + '</span>' +
        '<button type="button" class="btn btn-sm eye-btn" data-eye="dom-' + i + '" title="Tampilkan" aria-pressed="false">' + window.Secret.EYE_SVG + '</button>' +
        '<button class="btn btn-sm btn-action-red" data-di="' + i + '">✕</button></div>';
    }).join('') : '<div class="xt-sub">Belum ada domain.</div>';
    domains.forEach(function (d, i) { window.Secret.set('dom-' + i, d.host); });
  }

  function loadPorts() {
    jget('/api/ports').then(function (r) {
      if (!r.ok) return;
      domains = r.domains || [];
      renderDomains();
      window.Secret.set('sys-pub', r.publicUrl || '');
      $('#xs-pub-state').textContent = r.tunnelStatus === 'connected' ? 'Tunnel terhubung.' : r.tunnelStatus === 'connecting' ? 'Tunnel sedang menghubungkan...' : 'Tunnel tidak aktif.';
      var note = r.method === 'probe' ? '<div class="xt-hint" style="padding:0 16px 10px;">Perangkat tidak mengizinkan daftar port lengkap; ini hasil pemindaian port umum dan port app.</div>' : '';
      var box = $('#xs-ports');
      if (!r.ports.length) { box.innerHTML = '<div class="xt-empty">Tidak ada port terdeteksi.</div>'; return; }
      box.innerHTML = r.ports.map(function (p) {
        var vis = p.addr ? (p.public ? '<span class="xt-badge warn">semua antarmuka</span>' : '<span class="xt-badge">lokal</span>') : '';
        return '<div class="xt-row"><div class="xt-grow"><div class="xt-name" style="font-family:var(--font-mono);">:' + p.port + ' ' + vis + '</div>' +
          '<div class="xt-sub">' + esc([p.label, p.proc ? p.proc + (p.pid ? ' (pid ' + p.pid + ')' : '') : '', p.addr].filter(Boolean).join(' • ') || '-') + '</div></div></div>';
      }).join('') + note;
    }).catch(function () {});
  }

  function checkUpdate() {
    $('#xs-msg').textContent = 'Memeriksa GitHub...';
    jget('/api/update/check').then(function (r) {
      $('#xs-local').textContent = r.local || '-';
      $('#xs-remote').textContent = r.remote || '-';
      var run = $('#xs-run'), ch = $('#xs-change');
      run.style.display = 'none';
      ch.style.display = 'none';
      if (!r.ok) { $('#xs-msg').textContent = r.message; return; }
      if (r.message) { $('#xs-msg').textContent = r.message; return; }
      if (r.hasUpdate) {
        $('#xs-msg').innerHTML = '<span style="color:#34D399;">Versi baru tersedia.</span> Kredensial login dipertahankan saat update.';
        run.style.display = '';
        if (r.changelog) { ch.textContent = r.changelog; ch.style.display = ''; }
      } else {
        $('#xs-msg').textContent = 'Sudah versi terbaru.';
      }
    }).catch(function () {});
  }

  function pollUpdateLog() {
    var box = $('#xs-log');
    box.style.display = '';
    var n = 0;
    (function tick() {
      jget('/api/update/log').then(function (r) {
        box.textContent = r.log || '';
        box.scrollTop = box.scrollHeight;
      }).catch(function () {}).then(function () {
        if (++n < 40) setTimeout(tick, 2000);
      });
    })();
  }

  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    var b = $('#xs-pwa-install');
    if (b) b.style.display = '';
  });

  function pwaState() {
    var el = $('#xs-pwa-state');
    if (!el) return;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone) el.textContent = 'Panel sedang berjalan sebagai aplikasi terpasang.';
    else if (!window.isSecureContext) el.textContent = 'Pemasangan butuh HTTPS. Buka panel lewat URL tunnel (https://...) untuk memasang.';
    else if (ios) el.textContent = 'Di iPhone/iPad: ketuk Bagikan → "Tambah ke Layar Utama".';
    else if (deferredInstall) el.textContent = 'Panel bisa dipasang sebagai aplikasi.';
    else el.textContent = 'Di Chrome: menu ⋮ → "Instal aplikasi" / "Tambahkan ke layar utama".';
    var b = $('#xs-pwa-install');
    if (b) b.style.display = deferredInstall && !standalone ? '' : 'none';
  }

  function bindSys(sec) {
    $('#xs-check', sec).onclick = checkUpdate;
    $('#xs-run', sec).onclick = function () {
      confirmBox('Update server', 'Unduh versi terbaru dari GitHub dan restart panel? Koneksi akan terputus sebentar.', 'Update', function () {
        jpost('/api/update/run').then(function (r) {
          toast(r.message, r.ok ? 'success' : 'error');
          if (r.ok) pollUpdateLog();
        });
      });
    };
    $('#xs-reconn', sec).onclick = function () {
      confirmBox('Ganti URL tunnel', 'Tunnel dihubungkan ulang dan URL publik akan berubah. Lanjutkan?', 'Lanjutkan', function () {
        if (window.doReconnectTunnel) window.doReconnectTunnel();
        setTimeout(loadPorts, 6000);
      });
    };
    $('#xs-pub-copy', sec).onclick = function () {
      var v = window.Secret.get('sys-pub');
      if (v) window.copyToClipboard(v).then(function () { toast('URL disalin', 'success'); }).catch(function () {});
    };
    $('#xs-pub-open', sec).onclick = function () {
      var v = window.Secret.get('sys-pub');
      if (v) window.open(v, '_blank', 'noopener');
    };
    $('#xs-ports-refresh', sec).onclick = loadPorts;
    $('#xs-dom-add', sec).onclick = function () {
      var host = $('#xs-dom-host').value.trim().toLowerCase();
      var port = parseInt($('#xs-dom-port').value, 10);
      if (!host || !(port >= 1 && port <= 65535)) { toast('Isi domain dan port yang valid.', 'error'); return; }
      domains.push({ host: host, port: port });
      $('#xs-dom-host').value = '';
      $('#xs-dom-port').value = '';
      renderDomains();
    };
    $('#xs-dom', sec).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-di]');
      if (b) { domains.splice(parseInt(b.getAttribute('data-di'), 10), 1); renderDomains(); }
    });
    $('#xs-dom-save', sec).onclick = function () {
      jpost('/api/ports/domains', { domains: domains }).then(function (r) { toast(r.message, r.ok ? 'success' : 'error'); });
    };
    $('#xs-dom-yaml', sec).onclick = function () {
      if (!domains.length) { toast('Tambahkan minimal satu domain.', 'error'); return; }
      var y = 'tunnel: ISI_TUNNEL_ID\ncredentials-file: ~/.cloudflared/ISI_TUNNEL_ID.json\n\ningress:\n' +
        domains.map(function (d) { return '  - hostname: ' + d.host + '\n    service: http://localhost:' + d.port; }).join('\n') +
        '\n  - service: http_status:404\n';
      var m = makeModal('xt-yaml', 'config.yml cloudflared',
        '<pre class="xt-pre" id="xt-yaml-pre">' + esc(y) + '</pre><div class="xt-hint">Ganti ISI_TUNNEL_ID dengan ID dari <code>cloudflared tunnel create nama</code>, lalu jalankan <code>cloudflared tunnel run</code>.</div>',
        '<button class="btn btn-sm" onclick="xtClose(\'xt-yaml\')">Tutup</button><button class="btn btn-sm btn-primary" id="xt-yaml-copy">Salin</button>', true);
      $('#xt-yaml-copy', m).onclick = function () { window.copyToClipboard(y).then(function () { toast('Config disalin', 'success'); }).catch(function () {}); };
    };
    $('#xs-pwa-install', sec).onclick = function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; pwaState(); });
    };
  }

  // ------------------------------------------------------------------
  // PENELUSUR LOG (di tab Logs & PM2)
  // ------------------------------------------------------------------
  var logState = { offset: 0, timer: null, lines: 0 };

  function buildLogViewer() {
    var first = $('#tab-services .log-card');
    if (!first) return;
    var card = document.createElement('div');
    card.className = 'log-card';
    card.innerHTML = cardHead('Penelusur Log', '#06B6D4',
      '<button class="btn btn-sm btn-action-blue" id="xl-go">Cari</button><a class="btn btn-sm btn-action-blue" id="xl-dl" href="#" download>Unduh</a>') +
      '<div class="xt-pad" style="padding-bottom:8px;">' +
      '<div class="xt-inline"><select class="form-input" id="xl-src" style="flex:2 1 160px;"></select>' +
      '<input class="form-input" id="xl-q" placeholder="Cari teks..." style="flex:3 1 160px;" autocapitalize="off">' +
      '<select class="form-input" id="xl-lv" style="flex:1 1 100px;"><option value="">Semua level</option><option value="error">Error</option><option value="warn">Warning</option><option value="info">Info</option><option value="debug">Debug</option></select></div>' +
      '<div class="xt-inline" style="margin-top:8px;">' +
      '<label class="xt-check"><input type="checkbox" id="xl-re"> Regex</label>' +
      '<label class="xt-check"><input type="checkbox" id="xl-follow"> Ikuti (live)</label>' +
      '<select class="form-input" id="xl-tail" style="flex:0 0 110px;"><option value="200">200 baris</option><option value="500" selected>500 baris</option><option value="1500">1500 baris</option><option value="3000">3000 baris</option></select>' +
      '<span class="xt-sub" id="xl-info" style="margin:0 0 0 auto;"></span></div></div>' +
      '<div class="xl-box" id="xl-out"></div>';
    first.after(card);

    function srcLoad() {
      jget('/api/logs/sources').then(function (r) {
        var s = $('#xl-src');
        var cur = s.value;
        s.innerHTML = r.sources.length ? r.sources.map(function (x) { return '<option value="' + esc(x.id) + '" data-p="' + esc(x.path) + '">' + esc(x.label) + ' (' + fmtBytes(x.size) + ')</option>'; }).join('') : '<option value="">Tidak ada log</option>';
        if (cur) s.value = cur;
        updateDl();
        if (!$('#xl-out').childNodes.length) search(false);
      }).catch(function () {});
    }
    function updateDl() {
      var o = $('#xl-src').selectedOptions[0];
      $('#xl-dl').href = o && o.getAttribute('data-p') ? '/api/files/download?path=' + encodeURIComponent(o.getAttribute('data-p')) : '#';
    }
    function qs(extra) {
      var p = new URLSearchParams({ src: $('#xl-src').value, q: $('#xl-q').value, level: $('#xl-lv').value, regex: $('#xl-re').checked ? '1' : '0', tail: $('#xl-tail').value });
      if (extra) Object.keys(extra).forEach(function (k) { p.set(k, extra[k]); });
      return p.toString();
    }
    function lineHtml(l, re) {
      var cls = /\b(error|err|fatal|exception|fail(ed|ure)?|traceback|unhandled)\b/i.test(l) ? ' lv-error' : /\bwarn(ing)?\b/i.test(l) ? ' lv-warn' : /\b(debug|trace)\b/i.test(l) ? ' lv-debug' : '';
      var h = esc(l);
      if (re) { try { h = h.replace(re, '<mark>$&</mark>'); } catch (e) {} }
      return '<span class="ln' + cls + '">' + h + '</span>';
    }
    function highlighter() {
      var q = $('#xl-q').value;
      if (!q) return null;
      try { return new RegExp($('#xl-re').checked ? q : esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); } catch (e) { return null; }
    }
    function search(append) {
      if (!$('#xl-src').value) return;
      var url = '/api/logs/read?' + qs(append ? { from: logState.offset } : null);
      jget(url).then(function (r) {
        var out = $('#xl-out');
        if (!r.ok) { out.textContent = r.message || 'Gagal membaca log.'; return; }
        var near = out.scrollTop + out.clientHeight >= out.scrollHeight - 40;
        var re = highlighter();
        if (!append) {
          out.innerHTML = r.lines.length ? r.lines.map(function (l) { return lineHtml(l, re); }).join('') : '<span class="xt-sub">Tidak ada baris yang cocok.</span>';
          logState.lines = r.lines.length;
          out.scrollTop = out.scrollHeight;
        } else if (r.lines.length) {
          out.insertAdjacentHTML('beforeend', r.lines.map(function (l) { return lineHtml(l, re); }).join(''));
          logState.lines += r.lines.length;
          while (out.childNodes.length > 3000) out.removeChild(out.firstChild);
          if (near) out.scrollTop = out.scrollHeight;
        }
        logState.offset = r.offset;
        $('#xl-info').textContent = logState.lines + ' baris • ' + fmtBytes(r.size);
      }).catch(function () {});
    }
    function setFollow(on) {
      clearInterval(logState.timer);
      logState.timer = null;
      if (on) logState.timer = setInterval(function () {
        if (!$('#tab-services').classList.contains('active')) return;
        search(true);
      }, 2000);
    }
    $('#xl-go').onclick = function () { search(false); };
    $('#xl-src').onchange = function () { updateDl(); search(false); };
    $('#xl-lv').onchange = function () { search(false); };
    $('#xl-tail').onchange = function () { search(false); };
    $('#xl-re').onchange = function () { search(false); };
    $('#xl-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') search(false); });
    $('#xl-follow').onchange = function () { setFollow(this.checked); if (this.checked) search(false); };
    window.xlInit = function () { srcLoad(); };
  }

  // ------------------------------------------------------------------
  // PWA REGISTRASI
  // ------------------------------------------------------------------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // ------------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------------
  function init() {
    if (!$('.tabs-nav') || !$('#tab-services') || typeof window.switchTab !== 'function') { return; }
    var apps = addTab('tab-apps', 'Apps', ICON.apps, appsHtml);
    var cron = addTab('tab-cron', 'Cron', ICON.cron, cronHtml);
    var sys = addTab('tab-system', 'Sistem', ICON.sys, sysHtml);
    bindApps(apps);
    bindCron(cron);
    bindSys(sys);
    buildLogViewer();

    var orig = window.switchTab;
    window.switchTab = function (id) {
      orig(id);
      if (id === 'tab-apps') loadApps();
      if (id === 'tab-cron') loadCron();
      if (id === 'tab-system') {
        $('#xs-local').textContent = '...';
        jget('/api/ext/version').then(function (r) { $('#xs-local').textContent = r.version; }).catch(function () {});
        loadPorts();
        pwaState();
      }
      if (id === 'tab-services' && window.xlInit) window.xlInit();
      var ab = $('.tab-btn.active');
      if (ab && ab.scrollIntoView) ab.scrollIntoView({ block: 'nearest', inline: 'center' });
    };
    window.addEventListener('appinstalled', pwaState);

    // Banner versi di bawah header (tema terminal)
    var main = $('main');
    if (main) {
      var bn = document.createElement('div');
      bn.className = 'k-banner';
      bn.textContent = '[i] austin-mini-server :: akses terbatas, login diperlukan';
      main.insertBefore(bn, main.firstChild);
      jget('/api/ext/version').then(function (r) {
        if (r && r.version) bn.innerHTML = '[i] austin-mini-server <b>v' + esc(r.version) + '</b> :: akses terbatas, login diperlukan';
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
