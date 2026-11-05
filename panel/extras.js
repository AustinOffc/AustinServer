/**
 * Austin Mini Server — Modul Fitur Tambahan
 * Author / Developer: Austin
 *
 * Isi: Deploy App, Editor .env, Backup & Restore, Cron Manager, Pencarian Log,
 * Multi-download ZIP, Manajer Port & Domain, Pemeriksa Update, aset PWA.
 * Zero dependency eksternal (hanya modul bawaan Node.js).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

module.exports = function createExtras(ctx) {
  const { BASE_DIR, LOG_DIR, PANEL_PORT, sendJSON, parseJSONBody, handleStreamingUpload } = ctx;

  const APPS_DIR = path.join(BASE_DIR, 'apps');
  const UPLOAD_DIR = path.join(APPS_DIR, '_uploads');
  const BACKUP_DIR = path.join(BASE_DIR, 'backups');
  const CONFIG_FILE = path.join(__dirname, 'extras-config.json');
  const CRON_FILE = path.join(__dirname, 'cron.json');
  const CRON_LOG = path.join(LOG_DIR, 'cron.log');
  const UPDATE_LOG = path.join(LOG_DIR, 'update.log');
  const VERSION_FILE = path.join(BASE_DIR, 'VERSION');
  const PUBLIC_DIR = path.join(__dirname, 'public');
  const REMOTE_RAW = 'https://raw.githubusercontent.com/austinoffc/AustinServer/main';

  const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const isWin = os.platform() === 'win32';

  [APPS_DIR, UPLOAD_DIR, BACKUP_DIR, LOG_DIR].forEach((d) => {
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  });

  // ------------------------------------------------------------------
  // UTIL
  // ------------------------------------------------------------------
  function readJSON(file, fallback) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {}
    return fallback;
  }

  function writeJSON(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function logLine(file, text) {
    try { fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`); } catch (e) {}
  }

  function isInside(parent, child) {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  /** Jalankan proses (tanpa shell) dan kumpulkan output. */
  function run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
      let out = '';
      let finished = false;
      let child;
      try {
        child = spawn(cmd, args, {
          cwd: opts.cwd,
          env: opts.env || process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        resolve({ code: -1, out: e.message });
        return;
      }
      const onData = (d) => {
        const s = d.toString();
        out += s;
        if (out.length > 200000) out = out.slice(-100000);
        if (opts.onData) opts.onData(s);
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const timer = setTimeout(() => {
        if (finished) return;
        try { child.kill('SIGKILL'); } catch (e) {}
        out += '\n[timeout] proses dihentikan.';
      }, opts.timeout || 120000);
      child.on('error', (e) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ code: -1, out: out + e.message });
      });
      child.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ code, out });
      });
    });
  }

  // ------------------------------------------------------------------
  // JOB RUNNER (proses panjang: deploy, backup, restore)
  // ------------------------------------------------------------------
  const jobs = new Map();

  function newJob(title) {
    const id = crypto.randomBytes(6).toString('hex');
    const job = { id, title, log: '', done: false, ok: false, startedAt: Date.now() };
    jobs.set(id, job);
    if (jobs.size > 30) {
      const oldest = Array.from(jobs.keys())[0];
      jobs.delete(oldest);
    }
    return job;
  }

  function jlog(job, text) {
    job.log += text.endsWith('\n') ? text : text + '\n';
    if (job.log.length > 100000) job.log = job.log.slice(-60000);
  }

  function finishJob(job, ok, msg) {
    if (msg) jlog(job, msg);
    job.ok = ok;
    job.done = true;
  }

  // ------------------------------------------------------------------
  // NODE VERSION MANAGER (pilih versi Node per app / terminal)
  // ------------------------------------------------------------------
  const nodemgr = require('./nodemgr')({
    BASE_DIR, sendJSON, parseJSONBody, run, newJob, jlog, finishJob,
    appsUsingVersion: (version) => {
      const out = [];
      let entries = [];
      try { entries = fs.readdirSync(APPS_DIR, { withFileTypes: true }); } catch (e) {}
      for (const e of entries) {
        if (e.isDirectory() && NAME_RE.test(e.name) && e.name !== '_uploads' && readMeta(e.name).nodeVersion === version) out.push(e.name);
      }
      return out;
    },
  });

  // ------------------------------------------------------------------
  // KONFIGURASI (backup schedule, domain)
  // ------------------------------------------------------------------
  const defaultConfig = {
    backup: { enabled: false, time: '03:00', target: 'all', keep: 5, lastRunDate: '' },
    domains: [],
  };

  function getConfig() {
    const cfg = readJSON(CONFIG_FILE, {});
    return {
      backup: Object.assign({}, defaultConfig.backup, cfg.backup || {}),
      domains: Array.isArray(cfg.domains) ? cfg.domains : [],
    };
  }

  function saveConfig(cfg) {
    writeJSON(CONFIG_FILE, cfg);
  }

  // ------------------------------------------------------------------
  // APPS: .env, meta, PM2
  // ------------------------------------------------------------------
  function appDir(name) {
    return path.join(APPS_DIR, name);
  }

  function readMeta(name) {
    return readJSON(path.join(appDir(name), '.austin-app.json'), {});
  }

  function writeMeta(name, meta) {
    writeJSON(path.join(appDir(name), '.austin-app.json'), meta);
  }

  function parseEnvText(text) {
    const pairs = [];
    String(text || '').split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) return;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2)) {
        v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      } else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
        v = v.slice(1, -1);
      }
      pairs.push({ key: m[1], value: v });
    });
    return pairs;
  }

  function stringifyEnv(pairs) {
    return pairs.map(({ key, value }) => {
      const v = String(value == null ? '' : value);
      if (/[\s#"'\\$`]/.test(v) || v === '') {
        return `${key}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      }
      return `${key}=${v}`;
    }).join('\n') + '\n';
  }

  function readEnvPairs(name) {
    const f = path.join(appDir(name), '.env');
    if (!fs.existsSync(f)) return [];
    return parseEnvText(fs.readFileSync(f, 'utf8'));
  }

  function buildAppEnv(name) {
    const env = Object.assign({}, process.env);
    readEnvPairs(name).forEach((p) => { env[p.key] = p.value; });
    const meta = readMeta(name);
    if (meta.port && !readEnvPairs(name).some((p) => p.key === 'PORT')) env.PORT = String(meta.port);
    return env;
  }

  let pm2Cache = { at: 0, list: [] };
  async function pm2List(force) {
    if (!force && Date.now() - pm2Cache.at < 2000) return pm2Cache.list;
    const r = await run('pm2', ['jlist'], { timeout: 6000 });
    let list = [];
    try {
      const i = r.out.indexOf('[');
      if (i >= 0) list = JSON.parse(r.out.slice(i, r.out.lastIndexOf(']') + 1));
    } catch (e) {}
    pm2Cache = { at: Date.now(), list };
    return list;
  }

  function pickStart(name) {
    const dir = appDir(name);
    const meta = readMeta(name);
    if (meta.startFile) {
      const f = path.resolve(dir, meta.startFile);
      if (isInside(dir, f) && fs.existsSync(f)) return { kind: 'file', file: meta.startFile };
    }
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.scripts && pkg.scripts.start) return { kind: 'npm' };
      if (pkg.main && fs.existsSync(path.join(dir, pkg.main))) return { kind: 'file', file: pkg.main };
    } catch (e) {}
    const guess = ['index.js', 'server.js', 'app.js', 'main.js', 'bot.js', 'index.mjs', 'main.py', 'app.py'];
    for (const g of guess) {
      if (fs.existsSync(path.join(dir, g))) return { kind: 'file', file: g };
    }
    return null;
  }

  async function startApp(name, job) {
    const say = (t) => job && jlog(job, t);
    const dir = appDir(name);
    const env = buildAppEnv(name);
    const list = await pm2List(true);
    const exists = list.some((p) => p.name === name);

    // Versi Node yang diminta app (kosong = Node bawaan Termux)
    const meta = readMeta(name);
    let ver = meta.nodeVersion || '';
    if (ver && !nodemgr.isInstalled(ver)) {
      say(`⚠ Node ${ver} tidak terpasang lagi, memakai Node bawaan.`);
      ver = '';
    }

    if (exists && (meta.startedNode || '') === ver) {
      const r = await run('pm2', ['restart', name, '--update-env'], { env, timeout: 20000 });
      say(r.out.trim());
      pm2Cache.at = 0;
      return r.code === 0;
    }
    if (exists) {
      // Versi Node berubah: proses PM2 harus dibuat ulang agar interpreter-nya berganti.
      say(`↻ Versi Node berubah (${meta.startedNode || 'bawaan'} → ${ver || 'bawaan'}), membuat ulang proses PM2...`);
      await run('pm2', ['delete', name], { timeout: 15000 });
    }

    const start = pickStart(name);
    if (!start) {
      say('✗ File start tidak ditemukan. Isi "File start" atau tambahkan script start di package.json.');
      return false;
    }

    let args;
    if (start.kind === 'npm') {
      if (ver) args = ['start', path.join(nodemgr.shimDir(ver), 'npm'), '--name', name, '--cwd', dir, '--interpreter', 'bash', '--', 'start'];
      else args = ['start', 'npm', '--name', name, '--cwd', dir, '--', 'start'];
    } else {
      args = ['start', start.file, '--name', name, '--cwd', dir];
      if (/\.py$/i.test(start.file)) args.push('--interpreter', 'python3');
      else if (/\.sh$/i.test(start.file)) args.push('--interpreter', 'bash');
      else if (ver) args.push('--interpreter', path.join(nodemgr.shimDir(ver), 'node'));
    }
    say(`$ pm2 ${args.join(' ')}`);
    const r = await run('pm2', args, { env, cwd: dir, timeout: 30000 });
    say(r.out.trim());
    await run('pm2', ['save'], { timeout: 10000 });
    pm2Cache.at = 0;
    if (r.code === 0) {
      const mm = readMeta(name);
      mm.startedNode = ver;
      writeMeta(name, mm);
    }
    return r.code === 0;
  }

  async function listApps() {
    const pm2 = await pm2List();
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(APPS_DIR, { withFileTypes: true }); } catch (e) {}
    for (const e of entries) {
      if (!e.isDirectory() || !NAME_RE.test(e.name) || e.name === '_uploads') continue;
      const meta = readMeta(e.name);
      const p = pm2.find((x) => x.name === e.name);
      const env = (p && p.pm2_env) || {};
      out.push({
        name: e.name,
        port: meta.port || null,
        startFile: meta.startFile || '',
        nodeVersion: meta.nodeVersion || '',
        createdAt: meta.createdAt || null,
        hasPackage: fs.existsSync(path.join(appDir(e.name), 'package.json')),
        hasEnv: fs.existsSync(path.join(appDir(e.name), '.env')),
        status: p ? (env.status || 'unknown') : 'belum jalan',
        running: !!p && env.status === 'online',
        memory: p && p.monit ? p.monit.memory : 0,
        cpu: p && p.monit ? p.monit.cpu : 0,
        restarts: env.restart_time || 0,
        uptime: p && env.pm_uptime && env.status === 'online' ? Date.now() - env.pm_uptime : 0,
      });
    }
    return out;
  }

  function flattenInto(srcDir, destDir) {
    let items = fs.readdirSync(srcDir).filter((n) => n !== '__MACOSX' && n !== '.DS_Store');
    let root = srcDir;
    while (items.length === 1 && fs.statSync(path.join(root, items[0])).isDirectory()) {
      root = path.join(root, items[0]);
      items = fs.readdirSync(root).filter((n) => n !== '__MACOSX' && n !== '.DS_Store');
    }
    return root;
  }

  async function npmInstall(dir, onData, version) {
    const opts = { cwd: dir, timeout: 15 * 60 * 1000, onData };
    const t = nodemgr.toolCmd(version, 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund']);
    let r = await run(t.cmd, t.args, opts);
    if (r.code !== 0) {
      const t2 = nodemgr.toolCmd(version, 'npm', ['install', '--production', '--no-audit', '--no-fund']);
      r = await run(t2.cmd, t2.args, opts);
    }
    return r;
  }

  async function deployApp(job, opts) {
    const { name, zipPath, startFile, port, overwrite, nodeVersion } = opts;
    const dir = appDir(name);
    const tmp = path.join(APPS_DIR, `.tmp-${job.id}`);
    try {
      if (fs.existsSync(dir) && !overwrite) {
        finishJob(job, false, `✗ App "${name}" sudah ada. Centang "Timpa" untuk deploy ulang.`);
        return;
      }
      jlog(job, `▶ Deploy "${name}"`);
      fs.mkdirSync(tmp, { recursive: true });

      jlog(job, '[1/4] Mengekstrak ZIP...');
      const ex = await run(isWin ? 'tar' : 'unzip', isWin ? ['-xf', zipPath, '-C', tmp] : ['-oq', zipPath, '-d', tmp], { timeout: 120000 });
      if (ex.code !== 0) {
        finishJob(job, false, '✗ Ekstrak gagal: ' + ex.out.trim());
        return;
      }

      const root = flattenInto(tmp, dir);
      fs.mkdirSync(dir, { recursive: true });
      const cp = await run('cp', ['-a', root + '/.', dir + '/'], { timeout: 60000 });
      if (cp.code !== 0) {
        finishJob(job, false, '✗ Salin file gagal: ' + cp.out.trim());
        return;
      }

      const prev = readMeta(name);
      writeMeta(name, {
        startFile: startFile || prev.startFile || '',
        port: port || prev.port || null,
        nodeVersion: nodeVersion !== undefined ? nodeVersion : (prev.nodeVersion || ''),
        startedNode: prev.startedNode || '',
        createdAt: prev.createdAt || Date.now(),
        updatedAt: Date.now(),
      });

      if (fs.existsSync(path.join(dir, 'package.json'))) {
        jlog(job, '[2/4] npm install (bisa beberapa menit)...');
        const nv = readMeta(name).nodeVersion || '';
        if (nv) jlog(job, `    (memakai Node ${nv} via PRoot)`);
        const npm = await npmInstall(dir, (s) => jlog(job, s.trimEnd()), nv);
        if (npm.code !== 0) {
          finishJob(job, false, '✗ npm install gagal.');
          return;
        }
      } else {
        jlog(job, '[2/4] package.json tidak ada, lewati npm install.');
      }

      jlog(job, '[3/4] Menjalankan dengan PM2...');
      const ok = await startApp(name, job);
      jlog(job, ok ? '[4/4] Selesai.' : '[4/4] App ter-deploy tetapi gagal dijalankan.');
      finishJob(job, ok, ok ? `✓ App "${name}" aktif.` : '✗ Periksa log di bagian Logs & PM2.');
    } catch (e) {
      finishJob(job, false, '✗ Error: ' + e.message);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
      try {
        if (zipPath && isInside(UPLOAD_DIR, zipPath)) fs.unlinkSync(zipPath);
      } catch (e) {}
    }
  }

  // ------------------------------------------------------------------
  // BACKUP & RESTORE
  // ------------------------------------------------------------------
  const BACKUP_RE = /^(auto-)?(all|app-[A-Za-z0-9_-]{1,40})_\d{8}-\d{6}\.zip$/;

  function listBackups() {
    let files = [];
    try { files = fs.readdirSync(BACKUP_DIR); } catch (e) {}
    return files.filter((f) => BACKUP_RE.test(f)).map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, size: st.size, modifiedAt: st.mtimeMs, auto: f.startsWith('auto-') };
    }).sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async function createBackup(job, target, prefix) {
    const label = target === 'all' ? 'all' : 'app-' + target;
    const file = `${prefix || ''}${label}_${stamp()}.zip`;
    const out = path.join(BACKUP_DIR, file);
    jlog(job, `▶ Backup ${target === 'all' ? 'semua app' : 'app ' + target}...`);

    let r;
    if (target === 'all') {
      r = await run('zip', ['-rq', out, 'apps', '-x', 'apps/*/node_modules/*', '-x', 'apps/_uploads/*'], { cwd: BASE_DIR, timeout: 10 * 60 * 1000 });
    } else {
      r = await run('zip', ['-rq', out, target, '-x', `${target}/node_modules/*`], { cwd: APPS_DIR, timeout: 10 * 60 * 1000 });
    }
    if (r.code !== 0 && !fs.existsSync(out)) {
      jlog(job, '✗ Backup gagal: ' + r.out.trim());
      return null;
    }
    const size = fs.statSync(out).size;
    jlog(job, `✓ Tersimpan: ${file} (${(size / 1024).toFixed(1)} KB). node_modules tidak disertakan.`);
    return file;
  }

  function pruneAuto(keep) {
    const autos = listBackups().filter((b) => b.auto);
    autos.slice(Math.max(1, keep)).forEach((b) => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, b.file)); } catch (e) {}
    });
  }

  async function restoreBackup(job, file) {
    const full = path.join(BACKUP_DIR, file);
    const isAll = /^(auto-)?all_/.test(file);
    jlog(job, `▶ Restore ${file}`);
    const dest = isAll ? BASE_DIR : APPS_DIR;
    const r = await run(isWin ? 'tar' : 'unzip', isWin ? ['-xf', full, '-C', dest] : ['-oq', full, '-d', dest], { timeout: 5 * 60 * 1000 });
    if (r.code !== 0) {
      finishJob(job, false, '✗ Restore gagal: ' + r.out.trim());
      return;
    }
    jlog(job, '✓ File dipulihkan.');

    const names = [];
    if (isAll) {
      try {
        fs.readdirSync(APPS_DIR, { withFileTypes: true }).forEach((e) => {
          if (e.isDirectory() && NAME_RE.test(e.name) && e.name !== '_uploads') names.push(e.name);
        });
      } catch (e) {}
    } else {
      names.push(file.replace(/^(auto-)?app-/, '').replace(/_\d{8}-\d{6}\.zip$/, ''));
    }
    for (const n of names) {
      const d = appDir(n);
      if (fs.existsSync(path.join(d, 'package.json')) && !fs.existsSync(path.join(d, 'node_modules'))) {
        jlog(job, `npm install untuk ${n}...`);
        await npmInstall(d, undefined, readMeta(n).nodeVersion || '');
      }
    }
    finishJob(job, true, 'Selesai. Restart app dari tab Apps bila perlu.');
  }

  // ------------------------------------------------------------------
  // CRON MANAGER
  // ------------------------------------------------------------------
  const CRON_ALIASES = {
    '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *',
    '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *',
  };

  function parseCronField(str, min, max) {
    const set = new Set();
    str.split(',').forEach((part) => {
      let [range, stepStr] = part.split('/');
      const step = stepStr === undefined ? 1 : parseInt(stepStr, 10);
      if (!Number.isInteger(step) || step < 1) throw new Error(`Step tidak valid: ${part}`);
      let lo, hi;
      if (range === '*') {
        lo = min; hi = max;
      } else if (/^\d+-\d+$/.test(range)) {
        [lo, hi] = range.split('-').map(Number);
      } else if (/^\d+$/.test(range)) {
        lo = parseInt(range, 10);
        hi = stepStr === undefined ? lo : max;
      } else {
        throw new Error(`Field tidak valid: ${part}`);
      }
      if (lo < min || hi > max || lo > hi) throw new Error(`Di luar rentang (${min}-${max}): ${part}`);
      for (let i = lo; i <= hi; i += step) set.add(i);
    });
    return set;
  }

  function parseCron(expr) {
    let e = String(expr || '').trim().replace(/\s+/g, ' ');
    if (CRON_ALIASES[e.toLowerCase()]) e = CRON_ALIASES[e.toLowerCase()];
    const f = e.split(' ');
    if (f.length !== 5) throw new Error('Jadwal harus 5 field: menit jam tanggal bulan hari');
    const dow = parseCronField(f[4], 0, 7);
    if (dow.has(7)) dow.add(0);
    return {
      min: parseCronField(f[0], 0, 59),
      hour: parseCronField(f[1], 0, 23),
      dom: parseCronField(f[2], 1, 31),
      mon: parseCronField(f[3], 1, 12),
      dow,
      domStar: f[2].startsWith('*'),
      dowStar: f[4].startsWith('*'),
    };
  }

  function dayMatches(c, d) {
    if (!c.mon.has(d.getMonth() + 1)) return false;
    const domOk = c.dom.has(d.getDate());
    const dowOk = c.dow.has(d.getDay());
    if (c.domStar && c.dowStar) return true;
    if (c.domStar) return dowOk;
    if (c.dowStar) return domOk;
    return domOk || dowOk;
  }

  function cronMatches(c, d) {
    return c.min.has(d.getMinutes()) && c.hour.has(d.getHours()) && dayMatches(c, d);
  }

  function nextCronRun(expr, from) {
    let c;
    try { c = parseCron(expr); } catch (e) { return null; }
    const d = new Date((from || new Date()).getTime());
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    const limit = Date.now() + 400 * 24 * 3600 * 1000;
    while (d.getTime() < limit) {
      if (!dayMatches(c, d)) {
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        continue;
      }
      if (!c.hour.has(d.getHours())) {
        d.setHours(d.getHours() + 1, 0, 0, 0);
        continue;
      }
      if (c.min.has(d.getMinutes())) return d.getTime();
      d.setMinutes(d.getMinutes() + 1);
    }
    return null;
  }

  function loadCron() {
    const data = readJSON(CRON_FILE, { jobs: [] });
    return Array.isArray(data.jobs) ? data.jobs : [];
  }

  function saveCron(list) {
    writeJSON(CRON_FILE, { jobs: list });
  }

  const cronRunning = new Set();

  function runCronJob(id, manual) {
    const jobs_ = loadCron();
    const job = jobs_.find((j) => j.id === id);
    if (!job) return false;
    if (cronRunning.has(id)) return false;
    cronRunning.add(id);

    const startedAt = Date.now();
    let cwd = job.cwd && fs.existsSync(job.cwd) ? job.cwd : BASE_DIR;
    let output = '';
    logLine(CRON_LOG, `▶ [${job.name}] ${manual ? '(manual) ' : ''}$ ${job.command}`);

    let child;
    try {
      child = spawn(isWin ? 'cmd' : 'sh', isWin ? ['/c', job.command] : ['-c', job.command], {
        cwd, env: nodemgr.shellEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      cronRunning.delete(id);
      return false;
    }

    const timeoutMs = Math.min(Math.max(parseInt(job.timeoutSec, 10) || 300, 5), 3600) * 1000;
    const killer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) {}
      output += '\n[timeout] dihentikan.';
    }, timeoutMs);

    const onData = (d) => {
      output += d.toString();
      if (output.length > 20000) output = output.slice(-10000);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const finish = (code, err) => {
      clearTimeout(killer);
      cronRunning.delete(id);
      const list = loadCron();
      const j = list.find((x) => x.id === id);
      if (j) {
        j.lastRun = startedAt;
        j.lastDurationMs = Date.now() - startedAt;
        j.lastStatus = code === 0 ? 'ok' : 'gagal';
        j.lastCode = code;
        j.lastOutput = (err ? err + '\n' : '') + output.slice(-3000);
        saveCron(list);
      }
      logLine(CRON_LOG, `${code === 0 ? '✓' : '✗'} [${job.name}] selesai (kode ${code}) ${Date.now() - startedAt}ms`);
      if (output.trim()) logLine(CRON_LOG, output.trim().slice(-1500));
    };
    child.on('error', (e) => finish(-1, e.message));
    child.on('close', (code) => finish(code));
    return true;
  }

  let lastCronMinute = '';
  function cronTick() {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (key === lastCronMinute) return;
    lastCronMinute = key;
    loadCron().forEach((j) => {
      if (!j.enabled) return;
      try {
        if (cronMatches(parseCron(j.schedule), now)) runCronJob(j.id, false);
      } catch (e) {}
    });
  }

  function validateCronBody(body) {
    const name = String(body.name || '').trim().slice(0, 60);
    const schedule = String(body.schedule || '').trim();
    const command = String(body.command || '').trim();
    if (!name) throw new Error('Nama wajib diisi.');
    if (!command) throw new Error('Perintah wajib diisi.');
    if (command.length > 2000) throw new Error('Perintah terlalu panjang.');
    parseCron(schedule);
    return {
      name, schedule, command,
      cwd: String(body.cwd || '').trim(),
      timeoutSec: Math.min(Math.max(parseInt(body.timeoutSec, 10) || 300, 5), 3600),
      enabled: body.enabled !== false,
    };
  }

  // ------------------------------------------------------------------
  // SCHEDULER BACKUP
  // ------------------------------------------------------------------
  async function backupTick() {
    const cfg = getConfig();
    const b = cfg.backup;
    if (!b.enabled) return;
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    const hm = `${p(now.getHours())}:${p(now.getMinutes())}`;
    if (hm !== b.time || b.lastRunDate === today) return;

    cfg.backup.lastRunDate = today;
    saveConfig(cfg);
    const job = newJob('Backup otomatis');
    const target = b.target === 'all' || NAME_RE.test(b.target) ? b.target : 'all';
    await createBackup(job, target, 'auto-');
    pruneAuto(parseInt(b.keep, 10) || 5);
    finishJob(job, true);
    logLine(path.join(LOG_DIR, 'panel.log'), '[BACKUP] Backup otomatis dijalankan.');
  }

  setInterval(() => { cronTick(); backupTick().catch(() => {}); }, 15000);

  // ------------------------------------------------------------------
  // LOG SEARCH
  // ------------------------------------------------------------------
  function pm2LogDir() {
    return path.join(process.env.HOME || os.homedir(), '.pm2', 'logs');
  }

  function listLogSources() {
    const out = [];
    const add = (dir, prefix) => {
      try {
        fs.readdirSync(dir).filter((f) => f.endsWith('.log')).forEach((f) => {
          const full = path.join(dir, f);
          const st = fs.statSync(full);
          out.push({ id: `${prefix}:${f}`, label: prefix === 'pm2' ? `PM2 • ${f}` : f, path: full, size: st.size });
        });
      } catch (e) {}
    };
    add(LOG_DIR, 'logs');
    add(pm2LogDir(), 'pm2');
    return out;
  }

  const LEVEL_RE = {
    error: /\b(error|err|fatal|exception|fail(?:ed|ure)?|traceback|unhandled|✗)\b/i,
    warn: /\b(warn(?:ing)?)\b/i,
    info: /\b(info)\b/i,
    debug: /\b(debug|trace)\b/i,
  };

  function readLog(params) {
    const sources = listLogSources();
    const src = sources.find((s) => s.id === params.get('src'));
    if (!src) return { ok: false, message: 'Sumber log tidak ditemukan.' };

    const q = (params.get('q') || '').slice(0, 200);
    const level = params.get('level') || '';
    const useRegex = params.get('regex') === '1';
    const tail = Math.min(Math.max(parseInt(params.get('tail'), 10) || 300, 10), 3000);
    const fromParam = params.get('from');

    let matcher = null;
    if (q) {
      if (useRegex) {
        try { matcher = new RegExp(q, 'i'); } catch (e) { return { ok: false, message: 'Regex tidak valid.' }; }
      } else {
        const lower = q.toLowerCase();
        matcher = { test: (s) => s.toLowerCase().includes(lower) };
      }
    }

    const st = fs.statSync(src.path);
    let start;
    const MAXCHUNK = 512 * 1024;
    if (fromParam !== null && fromParam !== '' && Number(fromParam) <= st.size) {
      start = Math.max(Number(fromParam), st.size - MAXCHUNK);
    } else {
      start = Math.max(0, st.size - MAXCHUNK);
    }

    let text = '';
    if (st.size > start) {
      const fd = fs.openSync(src.path, 'r');
      const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    }

    let lines = text.split('\n');
    if (start > 0 && (fromParam === null || fromParam === '')) lines.shift();
    if (lines.length && lines[lines.length - 1] === '') lines.pop();

    if (level && LEVEL_RE[level]) lines = lines.filter((l) => LEVEL_RE[level].test(l));
    if (matcher) lines = lines.filter((l) => matcher.test(l));
    const total = lines.length;
    if (lines.length > tail) lines = lines.slice(-tail);

    return { ok: true, lines, offset: st.size, total, path: src.path, size: st.size };
  }

  // ------------------------------------------------------------------
  // PORT & DOMAIN
  // ------------------------------------------------------------------
  function probePort(port) {
    return new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(500);
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('error', () => { s.destroy(); resolve(false); });
      s.once('timeout', () => { s.destroy(); resolve(false); });
      s.connect(port, '127.0.0.1');
    });
  }

  async function listPorts() {
    const found = new Map();
    const put = (port, addr, proc, pid) => {
      if (!port) return;
      const cur = found.get(port) || { port, addr: addr || '', proc: '', pid: null };
      if (proc && !cur.proc) cur.proc = proc;
      if (pid && !cur.pid) cur.pid = pid;
      if (addr && !cur.addr) cur.addr = addr;
      found.set(port, cur);
    };
    let method = 'probe';

    if (!isWin) {
      const ss = await run('ss', ['-tlnp'], { timeout: 4000 });
      if (ss.code === 0 && ss.out.includes('LISTEN')) {
        method = 'ss';
        ss.out.split('\n').forEach((l) => {
          const m = l.match(/LISTEN\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+\s*(.*)$/);
          if (!m) return;
          const u = (m[3] || '').match(/\("([^"]+)",pid=(\d+)/);
          put(parseInt(m[2], 10), m[1], u ? u[1] : '', u ? parseInt(u[2], 10) : null);
        });
      } else {
        const ns = await run('netstat', ['-tlnp'], { timeout: 4000 });
        if (ns.code === 0 && ns.out.includes('LISTEN')) {
          method = 'netstat';
          ns.out.split('\n').forEach((l) => {
            const m = l.match(/^tcp6?\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+\s+LISTEN\s*(?:(\d+)\/(\S+))?/);
            if (m) put(parseInt(m[2], 10), m[1], m[4] || '', m[3] ? parseInt(m[3], 10) : null);
          });
        }
      }

      if (method === 'probe') {
        for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
          try {
            const rows = fs.readFileSync(f, 'utf8').split('\n').slice(1);
            rows.forEach((r) => {
              const c = r.trim().split(/\s+/);
              if (c.length > 3 && c[3] === '0A') {
                put(parseInt(c[1].split(':')[1], 16), '', '', null);
                method = 'proc';
              }
            });
          } catch (e) {}
        }
      }
    }

    const meta = {};
    try {
      fs.readdirSync(APPS_DIR, { withFileTypes: true }).forEach((e) => {
        if (e.isDirectory() && NAME_RE.test(e.name) && e.name !== '_uploads') {
          const m = readMeta(e.name);
          const envPort = readEnvPairs(e.name).find((p) => p.key === 'PORT');
          const port = envPort ? parseInt(envPort.value, 10) : m.port;
          if (port) meta[port] = e.name;
        }
      });
    } catch (e) {}

    const wellKnown = { 22: 'SSH', 80: 'HTTP', 443: 'HTTPS', 2222: 'SSH VPS Ubuntu', 3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB' };
    wellKnown[PANEL_PORT] = 'Panel Austin';

    if (method === 'probe') {
      const candidates = new Set([PANEL_PORT, 2222, 80, 443, 3000, 3001, 4000, 5000, 5173, 8000, 8080, 8081, 8888, 9000]);
      Object.keys(meta).forEach((p) => candidates.add(parseInt(p, 10)));
      const res = await Promise.all(Array.from(candidates).map(async (p) => [p, await probePort(p)]));
      res.forEach(([p, ok]) => { if (ok) put(p, '127.0.0.1', '', null); });
    }

    const list = Array.from(found.values()).map((p) => Object.assign(p, {
      label: meta[p.port] ? `App: ${meta[p.port]}` : (wellKnown[p.port] || ''),
      isApp: !!meta[p.port],
      isPanel: p.port === PANEL_PORT,
      public: /^(0\.0\.0\.0|\*|::|\[::\])$/.test(p.addr),
    })).sort((a, b) => a.port - b.port);

    return { method, ports: list };
  }

  // ------------------------------------------------------------------
  // UPDATE CHECKER
  // ------------------------------------------------------------------
  function localVersion() {
    try { return fs.readFileSync(VERSION_FILE, 'utf8').trim() || '0.0.0'; } catch (e) { return '0.0.0'; }
  }

  function fetchText(url, maxBytes) {
    return new Promise((resolve) => {
      const req = https.get(url, { timeout: 8000, headers: { 'User-Agent': 'austin-mini-server' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve({ status: res.statusCode, text: '' });
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (data.length > (maxBytes || 20000)) { res.destroy(); }
        });
        res.on('end', () => resolve({ status: 200, text: data }));
        res.on('close', () => resolve({ status: 200, text: data }));
      });
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: '' }); });
      req.on('error', () => resolve({ status: 0, text: '' }));
    });
  }

  function cmpVersion(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  async function checkUpdate() {
    const local = localVersion();
    const r = await fetchText(`${REMOTE_RAW}/VERSION`, 200);
    if (r.status === 200) {
      const remote = r.text.trim();
      const cl = await fetchText(`${REMOTE_RAW}/CHANGELOG.md`, 4000);
      return {
        ok: true, local, remote,
        hasUpdate: /^\d+(\.\d+)*$/.test(remote) && cmpVersion(remote, local) > 0,
        changelog: cl.status === 200 ? cl.text.slice(0, 3000) : '',
      };
    }
    if (r.status === 404) {
      return { ok: true, local, remote: null, hasUpdate: false, message: 'File VERSION belum ada di repo austinoffc/AustinServer (branch main).' };
    }
    return { ok: false, local, message: 'Tidak dapat menghubungi GitHub. Periksa koneksi internet.' };
  }

  function runUpdate() {
    const script = path.join(BASE_DIR, 'update.sh');
    if (!fs.existsSync(script)) return { ok: false, message: 'update.sh tidak ditemukan.' };
    const fd = fs.openSync(UPDATE_LOG, 'w');
    const child = spawn('bash', [script], {
      cwd: BASE_DIR, detached: true, stdio: ['ignore', fd, fd], env: process.env,
    });
    child.unref();
    return { ok: true, message: 'Update dimulai. Panel akan restart otomatis.' };
  }

  // ------------------------------------------------------------------
  // MULTI DOWNLOAD ZIP
  // ------------------------------------------------------------------
  function streamMultiZip(req, res, dir, names) {
    const safe = names.filter((n) => typeof n === 'string' && n && !n.includes('/') && !n.includes('\\') && n !== '..' && n !== '.' && fs.existsSync(path.join(dir, n)));
    if (!safe.length) {
      sendJSON(res, 400, { ok: false, message: 'Tidak ada file valid yang dipilih.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(dir) || 'files')}-terpilih.zip"`,
    });
    const z = spawn('zip', ['-rq', '-', '--', ...safe], { cwd: dir });
    z.stdout.pipe(res);
    z.on('error', () => { try { res.end(); } catch (e) {} });
    req.on('close', () => { try { z.kill(); } catch (e) {} });
  }

  // ------------------------------------------------------------------
  // PWA / ASET PUBLIK
  // ------------------------------------------------------------------
  const STATIC = {
    '/extras.js': { file: 'extras.js', type: 'application/javascript; charset=utf-8', cache: 'no-cache' },
    '/theme-kali.css': { file: 'theme-kali.css', type: 'text/css; charset=utf-8', cache: 'no-cache' },
    '/editor.js': { file: 'editor.js', type: 'application/javascript; charset=utf-8', cache: 'no-cache' },
    '/manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8', cache: 'no-cache' },
    '/sw.js': { file: 'sw.js', type: 'application/javascript; charset=utf-8', cache: 'no-cache', extra: { 'Service-Worker-Allowed': '/' } },
    '/offline.html': { file: 'offline.html', type: 'text/html; charset=utf-8', cache: 'no-cache' },
  };

  function handlePublic(req, res, pathname) {
    if (req.method !== 'GET') return false;
    let entry = STATIC[pathname];
    let file;
    if (entry) {
      file = path.join(PUBLIC_DIR, entry.file);
    } else if (/^\/icons\/[a-z0-9-]+\.png$/.test(pathname)) {
      entry = { type: 'image/png', cache: 'public, max-age=86400' };
      file = path.join(PUBLIC_DIR, pathname);
    } else {
      return false;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, Object.assign({ 'Content-Type': entry.type, 'Cache-Control': entry.cache }, entry.extra || {}));
      res.end(data);
    });
    return true;
  }

  // ------------------------------------------------------------------
  // ROUTER API (setelah auth guard)
  // ------------------------------------------------------------------
  async function handle(req, res, pathname, url) {
    const m = req.method;
    const q = url.searchParams;

    const fail = (code, message) => sendJSON(res, code, { ok: false, message });

    // ---- NODE VERSION MANAGER ----
    if (pathname.startsWith('/api/node/') && (await nodemgr.handle(req, res, pathname))) return true;

    // ---- JOB ----
    if (m === 'GET' && pathname === '/api/ext/job') {
      const j = jobs.get(q.get('id'));
      if (!j) { fail(404, 'Job tidak ditemukan.'); return true; }
      sendJSON(res, 200, { ok: true, id: j.id, title: j.title, log: j.log, done: j.done, success: j.ok });
      return true;
    }

    // ---- APPS ----
    if (m === 'GET' && pathname === '/api/apps/list') {
      sendJSON(res, 200, { ok: true, appsDir: APPS_DIR.replace(/\\/g, '/'), apps: await listApps() });
      return true;
    }

    if (m === 'POST' && pathname === '/api/apps/upload') {
      handleStreamingUpload(req, UPLOAD_DIR, (err, files) => {
        if (err) { fail(500, 'Upload gagal: ' + err.message); return; }
        const zip = (files || []).find((f) => /\.zip$/i.test(f));
        if (!zip) { fail(400, 'File ZIP tidak ditemukan pada upload.'); return; }
        sendJSON(res, 200, { ok: true, zipPath: path.join(UPLOAD_DIR, zip) });
      });
      return true;
    }

    if (m === 'POST' && pathname === '/api/apps/deploy') {
      try {
        const b = await parseJSONBody(req);
        const name = String(b.name || '').trim();
        if (!NAME_RE.test(name) || name === '_uploads') { fail(400, 'Nama app: huruf/angka/_/- (maks 40).'); return true; }
        const zipPath = path.resolve(String(b.zipPath || ''));
        if (!/\.zip$/i.test(zipPath) || !fs.existsSync(zipPath)) { fail(400, 'File ZIP tidak ditemukan.'); return true; }
        let startFile = String(b.startFile || '').trim();
        if (startFile && (path.isAbsolute(startFile) || startFile.split(/[\\/]/).includes('..'))) { fail(400, 'File start tidak valid.'); return true; }
        let port = b.port ? parseInt(b.port, 10) : null;
        if (b.port && !(port >= 1 && port <= 65535)) { fail(400, 'Port tidak valid.'); return true; }
        const nodeVersion = String(b.nodeVersion || '');
        if (nodeVersion && !nodemgr.isInstalled(nodeVersion)) { fail(400, `Node ${nodeVersion} belum terpasang.`); return true; }
        const job = newJob(`Deploy ${name}`);
        deployApp(job, { name, zipPath, startFile, port, overwrite: !!b.overwrite, nodeVersion });
        sendJSON(res, 200, { ok: true, jobId: job.id });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/apps/action') {
      try {
        const b = await parseJSONBody(req);
        const name = String(b.name || '');
        if (!NAME_RE.test(name) || !fs.existsSync(appDir(name))) { fail(404, 'App tidak ditemukan.'); return true; }
        const action = b.action;
        if (action === 'start' || action === 'restart') {
          const job = newJob(`${action} ${name}`);
          const ok = await startApp(name, job);
          sendJSON(res, ok ? 200 : 500, { ok, message: ok ? `App ${name} berjalan.` : job.log.trim() || 'Gagal menjalankan app.' });
        } else if (action === 'stop') {
          const r = await run('pm2', ['stop', name], { timeout: 15000 });
          pm2Cache.at = 0;
          sendJSON(res, r.code === 0 ? 200 : 500, { ok: r.code === 0, message: r.code === 0 ? `App ${name} dihentikan.` : r.out.trim() });
        } else if (action === 'delete') {
          await run('pm2', ['delete', name], { timeout: 15000 });
          await run('pm2', ['save'], { timeout: 10000 });
          pm2Cache.at = 0;
          if (b.removeFiles) {
            const d = appDir(name);
            if (isInside(APPS_DIR, d)) fs.rmSync(d, { recursive: true, force: true });
          }
          sendJSON(res, 200, { ok: true, message: b.removeFiles ? `App ${name} dihapus beserta file.` : `App ${name} dihapus dari PM2 (file dipertahankan).` });
        } else {
          fail(400, 'Aksi tidak valid.');
        }
      } catch (e) { fail(500, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/apps/meta') {
      try {
        const b = await parseJSONBody(req);
        const name = String(b.name || '');
        if (!NAME_RE.test(name) || !fs.existsSync(appDir(name))) { fail(404, 'App tidak ditemukan.'); return true; }
        const meta = readMeta(name);
        if (b.startFile !== undefined) {
          const sf = String(b.startFile).trim();
          if (sf && (path.isAbsolute(sf) || sf.split(/[\\/]/).includes('..'))) { fail(400, 'File start tidak valid.'); return true; }
          meta.startFile = sf;
        }
        if (b.port !== undefined) {
          const p = b.port ? parseInt(b.port, 10) : null;
          if (b.port && !(p >= 1 && p <= 65535)) { fail(400, 'Port tidak valid.'); return true; }
          meta.port = p;
        }
        let changedNode = false;
        if (b.nodeVersion !== undefined) {
          const nv = String(b.nodeVersion || '');
          if (nv && !nodemgr.isInstalled(nv)) { fail(400, `Node ${nv} belum terpasang.`); return true; }
          changedNode = (meta.nodeVersion || '') !== nv;
          meta.nodeVersion = nv;
        }
        writeMeta(name, meta);
        if (changedNode && b.reinstall && fs.existsSync(path.join(appDir(name), 'package.json'))) {
          // node_modules lama (native addon) tidak kompatibel antar versi/runtime: pasang ulang.
          const job = newJob(`Pasang ulang dependensi ${name}`);
          (async () => {
            try {
              const d = appDir(name);
              const wasRunning = (await pm2List(true)).some((p) => p.name === name && p.pm2_env && p.pm2_env.status === 'online');
              jlog(job, `▶ Node ${meta.nodeVersion || 'bawaan'} untuk "${name}"`);
              jlog(job, '[1/3] Menghapus node_modules lama...');
              fs.rmSync(path.join(d, 'node_modules'), { recursive: true, force: true });
              jlog(job, '[2/3] npm install (bisa beberapa menit)...');
              const r = await npmInstall(d, (s) => jlog(job, s.trimEnd()), meta.nodeVersion || '');
              if (r.code !== 0) { finishJob(job, false, '✗ npm install gagal.'); return; }
              if (wasRunning) {
                jlog(job, '[3/3] Restart app dengan versi baru...');
                const ok = await startApp(name, job);
                finishJob(job, ok, ok ? `✓ "${name}" berjalan di Node ${meta.nodeVersion || 'bawaan'}.` : '✗ Gagal menjalankan app.');
              } else {
                finishJob(job, true, '✓ Dependensi terpasang. Tekan Start untuk menjalankan app.');
              }
            } catch (e) { finishJob(job, false, '✗ Error: ' + e.message); }
          })();
          sendJSON(res, 200, { ok: true, message: 'Pengaturan app disimpan.', jobId: job.id });
          return true;
        }
        sendJSON(res, 200, { ok: true, message: changedNode ? 'Tersimpan. Pasang ulang dependensi (npm install) lalu restart app agar versi baru dipakai.' : 'Pengaturan app disimpan.' });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    // ---- ENV ----
    if (m === 'GET' && pathname === '/api/apps/env') {
      const name = q.get('name') || '';
      if (!NAME_RE.test(name) || !fs.existsSync(appDir(name))) { fail(404, 'App tidak ditemukan.'); return true; }
      sendJSON(res, 200, { ok: true, name, env: readEnvPairs(name) });
      return true;
    }

    if (m === 'POST' && pathname === '/api/apps/env') {
      try {
        const b = await parseJSONBody(req);
        const name = String(b.name || '');
        if (!NAME_RE.test(name) || !fs.existsSync(appDir(name))) { fail(404, 'App tidak ditemukan.'); return true; }
        const seen = new Set();
        const pairs = [];
        for (const p of Array.isArray(b.env) ? b.env : []) {
          const key = String(p.key || '').trim();
          if (!key) continue;
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) { fail(400, `Nama variabel tidak valid: ${key}`); return true; }
          if (seen.has(key)) { fail(400, `Variabel duplikat: ${key}`); return true; }
          seen.add(key);
          pairs.push({ key, value: String(p.value == null ? '' : p.value) });
        }
        fs.writeFileSync(path.join(appDir(name), '.env'), stringifyEnv(pairs), { encoding: 'utf8', mode: 0o600 });
        let msg = `.env tersimpan (${pairs.length} variabel).`;
        if (b.restart) {
          const job = newJob('restart');
          const ok = await startApp(name, job);
          msg += ok ? ' App direstart.' : ' Gagal restart app.';
        }
        sendJSON(res, 200, { ok: true, message: msg });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    // ---- BACKUP ----
    if (m === 'GET' && pathname === '/api/backups/list') {
      sendJSON(res, 200, { ok: true, backups: listBackups(), schedule: getConfig().backup });
      return true;
    }

    if (m === 'POST' && pathname === '/api/backups/create') {
      try {
        const b = await parseJSONBody(req);
        const target = String(b.target || 'all');
        if (target !== 'all' && (!NAME_RE.test(target) || !fs.existsSync(appDir(target)))) { fail(404, 'App tidak ditemukan.'); return true; }
        const job = newJob('Backup');
        createBackup(job, target, '').then((f) => finishJob(job, !!f));
        sendJSON(res, 200, { ok: true, jobId: job.id });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/backups/restore') {
      try {
        const b = await parseJSONBody(req);
        const file = path.basename(String(b.file || ''));
        if (!BACKUP_RE.test(file) || !fs.existsSync(path.join(BACKUP_DIR, file))) { fail(404, 'File backup tidak ditemukan.'); return true; }
        const job = newJob('Restore');
        restoreBackup(job, file);
        sendJSON(res, 200, { ok: true, jobId: job.id });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/backups/delete') {
      try {
        const b = await parseJSONBody(req);
        const file = path.basename(String(b.file || ''));
        if (!BACKUP_RE.test(file)) { fail(400, 'Nama file tidak valid.'); return true; }
        fs.unlinkSync(path.join(BACKUP_DIR, file));
        sendJSON(res, 200, { ok: true, message: 'Backup dihapus.' });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    if (m === 'GET' && pathname === '/api/backups/download') {
      const file = path.basename(q.get('file') || '');
      const full = path.join(BACKUP_DIR, file);
      if (!BACKUP_RE.test(file) || !fs.existsSync(full)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Backup tidak ditemukan');
        return true;
      }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': fs.statSync(full).size,
        'Content-Disposition': `attachment; filename="${file}"`,
      });
      fs.createReadStream(full).pipe(res);
      return true;
    }

    if (m === 'POST' && pathname === '/api/backups/schedule') {
      try {
        const b = await parseJSONBody(req);
        const time = String(b.time || '03:00');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { fail(400, 'Format jam HH:MM.'); return true; }
        const target = String(b.target || 'all');
        if (target !== 'all' && !NAME_RE.test(target)) { fail(400, 'Target tidak valid.'); return true; }
        const cfg = getConfig();
        cfg.backup = Object.assign(cfg.backup, {
          enabled: !!b.enabled,
          time,
          target,
          keep: Math.min(Math.max(parseInt(b.keep, 10) || 5, 1), 50),
        });
        saveConfig(cfg);
        sendJSON(res, 200, { ok: true, message: cfg.backup.enabled ? `Backup otomatis aktif tiap ${time}.` : 'Backup otomatis dimatikan.', schedule: cfg.backup });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    // ---- CRON ----
    if (m === 'GET' && pathname === '/api/cron/list') {
      const list = loadCron().map((j) => Object.assign({}, j, {
        nextRun: j.enabled ? nextCronRun(j.schedule) : null,
        running: cronRunning.has(j.id),
      }));
      sendJSON(res, 200, { ok: true, jobs: list, serverTime: Date.now(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      return true;
    }

    if (m === 'POST' && pathname === '/api/cron/save') {
      try {
        const b = await parseJSONBody(req);
        const data = validateCronBody(b);
        const list = loadCron();
        if (b.id) {
          const j = list.find((x) => x.id === b.id);
          if (!j) { fail(404, 'Job tidak ditemukan.'); return true; }
          Object.assign(j, data);
        } else {
          if (list.length >= 100) { fail(400, 'Maksimal 100 job.'); return true; }
          list.push(Object.assign({ id: crypto.randomBytes(5).toString('hex'), createdAt: Date.now() }, data));
        }
        saveCron(list);
        sendJSON(res, 200, { ok: true, message: 'Job tersimpan.' });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/cron/toggle') {
      try {
        const b = await parseJSONBody(req);
        const list = loadCron();
        const j = list.find((x) => x.id === b.id);
        if (!j) { fail(404, 'Job tidak ditemukan.'); return true; }
        j.enabled = !!b.enabled;
        saveCron(list);
        sendJSON(res, 200, { ok: true });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/cron/delete') {
      try {
        const b = await parseJSONBody(req);
        saveCron(loadCron().filter((x) => x.id !== b.id));
        sendJSON(res, 200, { ok: true, message: 'Job dihapus.' });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/cron/run') {
      try {
        const b = await parseJSONBody(req);
        const started = runCronJob(b.id, true);
        sendJSON(res, started ? 200 : 409, { ok: started, message: started ? 'Job dijalankan.' : 'Job sedang berjalan atau tidak ditemukan.' });
      } catch (e) { fail(400, e.message); }
      return true;
    }

    if (m === 'GET' && pathname === '/api/cron/log') {
      let text = '';
      try {
        if (fs.existsSync(CRON_LOG)) {
          const lines = fs.readFileSync(CRON_LOG, 'utf8').split('\n');
          text = lines.slice(-300).join('\n');
        }
      } catch (e) {}
      sendJSON(res, 200, { ok: true, log: text });
      return true;
    }

    // ---- LOG SEARCH ----
    if (m === 'GET' && pathname === '/api/logs/sources') {
      sendJSON(res, 200, { ok: true, sources: listLogSources() });
      return true;
    }

    if (m === 'GET' && pathname === '/api/logs/read') {
      try {
        const r = readLog(q);
        sendJSON(res, r.ok ? 200 : 400, r);
      } catch (e) { fail(500, e.message); }
      return true;
    }

    // ---- MULTI DOWNLOAD ----
    if (m === 'POST' && pathname === '/api/files/zip-multi') {
      try {
        const b = await parseJSONBody(req);
        const dir = path.resolve(String(b.dir || ''));
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { fail(400, 'Direktori tidak valid.'); return true; }
        streamMultiZip(req, res, dir, Array.isArray(b.names) ? b.names : []);
      } catch (e) { fail(400, e.message); }
      return true;
    }

    // ---- PORT & DOMAIN ----
    if (m === 'GET' && pathname === '/api/ports') {
      const r = await listPorts();
      const cfg = getConfig();
      sendJSON(res, 200, Object.assign({ ok: true, panelPort: PANEL_PORT, domains: cfg.domains }, r, ctx.getNetworkInfo ? ctx.getNetworkInfo() : {}));
      return true;
    }

    if (m === 'POST' && pathname === '/api/ports/domains') {
      try {
        const b = await parseJSONBody(req);
        const domains = [];
        for (const d of Array.isArray(b.domains) ? b.domains : []) {
          const host = String(d.host || '').trim().toLowerCase();
          const port = parseInt(d.port, 10);
          if (!host) continue;
          if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(host) || !(port >= 1 && port <= 65535)) { fail(400, `Domain/port tidak valid: ${host}`); return true; }
          domains.push({ host, port });
        }
        const cfg = getConfig();
        cfg.domains = domains.slice(0, 50);
        saveConfig(cfg);
        sendJSON(res, 200, { ok: true, message: 'Daftar domain tersimpan.', domains: cfg.domains });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    // ---- UPDATE ----
    if (m === 'GET' && pathname === '/api/update/check') {
      sendJSON(res, 200, await checkUpdate());
      return true;
    }

    if (m === 'POST' && pathname === '/api/update/run') {
      try {
        sendJSON(res, 200, runUpdate());
      } catch (e) { fail(500, e.message); }
      return true;
    }

    if (m === 'GET' && pathname === '/api/update/log') {
      let text = '';
      try { text = fs.readFileSync(UPDATE_LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').slice(-6000); } catch (e) {}
      sendJSON(res, 200, { ok: true, log: text });
      return true;
    }

    if (m === 'GET' && pathname === '/api/ext/version') {
      sendJSON(res, 200, { ok: true, version: localVersion() });
      return true;
    }

    return false;
  }

  return { handle, handlePublic, shellEnv: nodemgr.shellEnv };
};
