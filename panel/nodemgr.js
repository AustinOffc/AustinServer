/**
 * Austin Mini Server — Node.js Version Manager
 * Author: Austin
 *
 * Memungkinkan memilih versi Node.js (mis. 22) selain Node bawaan Termux.
 *
 * Cara kerja:
 *  - Binary resmi Node.js (linux-arm64, glibc) diunduh dari nodejs.org ke
 *    <BASE_DIR>/runtime/node/vX.Y.Z/ dan diverifikasi SHA-256.
 *  - Binary glibc tidak bisa jalan langsung di Termux (bionic), jadi dijalankan
 *    lewat PRoot Ubuntu yang sudah dipakai untuk VPS (~/ubuntu-fs).
 *  - Dibuat "shim" (node, npm, npx) berupa script bash yang membungkus proot.
 *    Shim dipakai sebagai --interpreter PM2 (per app) dan di-PATH-kan ke
 *    terminal web bila versi diaktifkan global.
 *
 * Zero dependency eksternal.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

module.exports = function createNodeMgr(ctx) {
  const { BASE_DIR, sendJSON, parseJSONBody, run, newJob, jlog, finishJob, appsUsingVersion } = ctx;

  const isWin = os.platform() === 'win32';
  const HOME = process.env.HOME || os.homedir();
  const RUNTIME_DIR = path.join(BASE_DIR, 'runtime', 'node');
  const SHIM_DIR = path.join(RUNTIME_DIR, '.shims');
  const CONFIG_FILE = path.join(RUNTIME_DIR, 'config.json');
  const DIST = (process.env.AUSTIN_NODE_DIST || 'https://nodejs.org/dist').replace(/\/+$/, '');
  const UBUNTU_DIR = process.env.AUSTIN_UBUNTU_DIR || path.join(HOME, 'ubuntu-fs');
  const TERMUX_FILES = '/data/data/com.termux/files';
  const TERMUX_BASH = TERMUX_FILES + '/usr/bin/bash';

  const VERSION_RE = /^v\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const MAJORS = [18, 20, 22, 24];

  let installing = false;

  // ------------------------------------------------------------------
  // UTIL
  // ------------------------------------------------------------------
  function readConfig() {
    try {
      const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { active: typeof c.active === 'string' ? c.active : '' };
    } catch (e) {
      return { active: '' };
    }
  }

  function writeConfig(cfg) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  }

  function distArch() {
    switch (os.arch()) {
      case 'arm64': return 'arm64';
      case 'arm': return 'armv7l';
      case 'x64': return 'x64';
      default: return null;
    }
  }

  function cmpVer(a, b) {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  }

  function nodeHome(version) {
    return path.join(RUNTIME_DIR, version);
  }

  function shimDir(version) {
    return path.join(SHIM_DIR, version);
  }

  /** Versi terpasang & shim-nya lengkap. */
  function isInstalled(version) {
    if (!VERSION_RE.test(version || '')) return false;
    return fs.existsSync(path.join(nodeHome(version), 'bin', 'node')) &&
      fs.existsSync(path.join(shimDir(version), 'node'));
  }

  function listInstalled() {
    let names = [];
    try { names = fs.readdirSync(RUNTIME_DIR); } catch (e) {}
    return names.filter((n) => VERSION_RE.test(n) && isInstalled(n)).sort((a, b) => cmpVer(b, a));
  }

  /** Cek prasyarat (proot + Ubuntu rootfs). */
  function prerequisites() {
    if (isWin) return { ok: false, reason: 'Fitur ini hanya untuk Termux/Linux.' };
    if (!distArch()) return { ok: false, reason: 'Arsitektur CPU ' + os.arch() + ' tidak didukung.' };
    const hasProot = (process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, 'proot'))) ||
      fs.existsSync(TERMUX_FILES + '/usr/bin/proot');
    if (!hasProot) return { ok: false, reason: 'proot belum terpasang. Jalankan: pkg install proot' };
    if (!fs.existsSync(path.join(UBUNTU_DIR, 'bin')) && !fs.existsSync(path.join(UBUNTU_DIR, 'usr', 'bin'))) {
      return { ok: false, reason: 'Ubuntu (ubuntu-fs) belum terpasang. Jalankan ulang install.sh dulu.' };
    }
    return { ok: true, reason: '' };
  }

  // ------------------------------------------------------------------
  // SHIM
  // ------------------------------------------------------------------
  function shimScript(tool, home) {
    const shebang = fs.existsSync(TERMUX_BASH) ? '#!' + TERMUX_BASH : '#!/usr/bin/env bash';
    return `${shebang}
# Austin Mini Server — shim Node.js (dibuat otomatis, jangan diedit)
# Menjalankan ${tool} milik ${path.basename(home)} di dalam PRoot Ubuntu.
NODE_HOME="${home}"
UBUNTU_DIR="\${AUSTIN_UBUNTU_DIR:-${UBUNTU_DIR}}"
TERMUX_FILES="${TERMUX_FILES}"

PROOT="$(command -v proot)"
if [ -z "$PROOT" ]; then
  echo "[austin-node] proot tidak ditemukan. Jalankan: pkg install proot" >&2
  exit 127
fi
if [ ! -d "$UBUNTU_DIR/usr/bin" ]; then
  echo "[austin-node] Ubuntu rootfs tidak ada di $UBUNTU_DIR" >&2
  exit 127
fi

CWD="$PWD"
case "$CWD" in
  "$TERMUX_FILES"*|/sdcard*|/storage*) ;;
  *) CWD="/root" ;;
esac

BINDS=(-b /dev -b /proc -b /sys)
[ -d /dev/pts ] && BINDS+=(-b /dev/pts)
[ -d "$TERMUX_FILES" ] && BINDS+=(-b "$TERMUX_FILES:$TERMUX_FILES")
[ -d /sdcard ] && BINDS+=(-b /sdcard)

export PROOT_NO_SECCOMP=1
unset LD_PRELOAD

exec "$PROOT" --link2symlink -0 -r "$UBUNTU_DIR" "\${BINDS[@]}" -w "$CWD" \\
  /usr/bin/env -u LD_PRELOAD -u LD_LIBRARY_PATH \\
  PATH="$NODE_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \\
  "$NODE_HOME/bin/${tool}" "$@"
`;
  }

  /** pm2 harus tetap memakai Node bawaan Termux walau shim ada di PATH. */
  function pm2PassthroughScript() {
    const shebang = fs.existsSync(TERMUX_BASH) ? '#!' + TERMUX_BASH : '#!/usr/bin/env bash';
    return `${shebang}
# Austin Mini Server — pm2 tetap pakai Node bawaan (dibuat otomatis)
SELF="$(cd "$(dirname "$0")" && pwd)"
CLEAN=""
IFS=':' read -ra PARTS <<< "$PATH"
for p in "\${PARTS[@]}"; do
  [ -z "$p" ] && continue
  case "$p" in "$SELF"|"$SELF"/*|*/runtime/node/v*/bin) continue ;; esac
  CLEAN="\${CLEAN:+$CLEAN:}$p"
done
REAL="$(PATH="$CLEAN" command -v pm2)"
if [ -z "$REAL" ]; then
  echo "[austin-node] pm2 tidak ditemukan. Jalankan: npm i -g pm2 (di Node bawaan)" >&2
  exit 127
fi
PATH="$CLEAN" exec "$REAL" "$@"
`;
  }

  function writeShims(version) {
    const dir = shimDir(version);
    fs.mkdirSync(dir, { recursive: true });
    const home = nodeHome(version);
    ['node', 'npm', 'npx'].forEach((t) => {
      const f = path.join(dir, t);
      fs.writeFileSync(f, shimScript(t, home), { encoding: 'utf8', mode: 0o755 });
      try { fs.chmodSync(f, 0o755); } catch (e) {}
    });
    const p = path.join(dir, 'pm2');
    fs.writeFileSync(p, pm2PassthroughScript(), { encoding: 'utf8', mode: 0o755 });
    try { fs.chmodSync(p, 0o755); } catch (e) {}
  }

  // ------------------------------------------------------------------
  // API UNTUK MODUL LAIN
  // ------------------------------------------------------------------
  /** Perintah (tanpa shell) untuk menjalankan tool dengan versi tertentu. */
  function toolCmd(version, tool, args) {
    if (version && isInstalled(version)) {
      return { cmd: 'bash', args: [path.join(shimDir(version), tool)].concat(args || []), custom: true };
    }
    return { cmd: tool, args: args || [], custom: false };
  }

  /** Env untuk terminal/cron: PATH diawali shim versi yang diaktifkan global. */
  function shellEnv(env) {
    const active = readConfig().active;
    if (!active || !isInstalled(active)) return env;
    const out = Object.assign({}, env);
    out.PATH = [shimDir(active), path.join(nodeHome(active), 'bin'), env.PATH || ''].filter(Boolean).join(':');
    out.AUSTIN_NODE_VERSION = active;
    return out;
  }

  // ------------------------------------------------------------------
  // INSTALL
  // ------------------------------------------------------------------
  function sha256File(file) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      const s = fs.createReadStream(file);
      s.on('data', (d) => h.update(d));
      s.on('end', () => resolve(h.digest('hex')));
      s.on('error', reject);
    });
  }

  function rmrf(p) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {}
  }

  async function installMajor(job, major, makeActive) {
    const tmp = path.join(RUNTIME_DIR, `.tmp-${job.id}`);
    try {
      const pre = prerequisites();
      if (!pre.ok) { finishJob(job, false, '✗ ' + pre.reason); return; }
      const arch = distArch();
      fs.mkdirSync(tmp, { recursive: true });

      jlog(job, `▶ Pasang Node.js ${major}.x (linux-${arch})`);
      jlog(job, '[1/5] Mencari versi terbaru...');
      const sumsUrl = `${DIST}/latest-v${major}.x/SHASUMS256.txt`;
      const sumsFile = path.join(tmp, 'SHASUMS256.txt');
      const dl0 = await run('curl', ['-fsSL', '--retry', '3', '--connect-timeout', '20', '-o', sumsFile, sumsUrl], { timeout: 60000 });
      if (dl0.code !== 0 || !fs.existsSync(sumsFile)) {
        finishJob(job, false, `✗ Tidak bisa mengambil daftar versi Node ${major} dari nodejs.org. Cek koneksi internet.\n${dl0.out.trim()}`);
        return;
      }
      const sums = fs.readFileSync(sumsFile, 'utf8').split('\n');
      const re = new RegExp(`^([a-f0-9]{64})\\s+(node-(v${major}\\.\\d+\\.\\d+)-linux-${arch}\\.tar\\.gz)\\s*$`);
      let hash = '', fileName = '', version = '';
      for (const line of sums) {
        const m = re.exec(line.trim());
        if (m) { hash = m[1]; fileName = m[2]; version = m[3]; break; }
      }
      if (!version) {
        finishJob(job, false, `✗ Node ${major} untuk linux-${arch} tidak tersedia di nodejs.org.`);
        return;
      }
      jlog(job, `    → ${version}`);

      if (isInstalled(version)) {
        jlog(job, `✓ ${version} sudah terpasang.`);
        if (makeActive) writeConfig({ active: version });
        finishJob(job, true, '');
        return;
      }

      jlog(job, '[2/5] Mengunduh (±30 MB, tunggu sebentar)...');
      const tgz = path.join(tmp, fileName);
      const dl = await run('curl', ['-fsSL', '--retry', '3', '--connect-timeout', '20', '-o', tgz, `${DIST}/latest-v${major}.x/${fileName}`], { timeout: 15 * 60 * 1000 });
      if (dl.code !== 0 || !fs.existsSync(tgz)) {
        finishJob(job, false, '✗ Unduhan gagal.\n' + dl.out.trim());
        return;
      }

      jlog(job, '[3/5] Verifikasi SHA-256...');
      const got = await sha256File(tgz);
      if (got !== hash) {
        finishJob(job, false, '✗ Checksum tidak cocok, file dibuang. Coba lagi.');
        return;
      }

      jlog(job, '[4/5] Mengekstrak...');
      const ex = await run('tar', ['-xzf', tgz, '-C', tmp, '--no-same-owner'], { timeout: 10 * 60 * 1000 });
      if (ex.code !== 0) {
        finishJob(job, false, '✗ Ekstrak gagal: ' + ex.out.trim());
        return;
      }
      const extracted = path.join(tmp, fileName.replace(/\.tar\.gz$/, ''));
      if (!fs.existsSync(path.join(extracted, 'bin', 'node'))) {
        finishJob(job, false, '✗ Isi arsip tidak sesuai (bin/node tidak ada).');
        return;
      }
      const home = nodeHome(version);
      rmrf(home);
      fs.renameSync(extracted, home);
      writeShims(version);

      jlog(job, '[5/5] Tes menjalankan lewat PRoot...');
      const t = await run('bash', [path.join(shimDir(version), 'node'), '-v'], { timeout: 60000 });
      if (t.code !== 0 || !t.out.trim().startsWith(version)) {
        rmrf(home);
        rmrf(shimDir(version));
        finishJob(job, false, '✗ Node ' + version + ' terunduh tetapi gagal dijalankan di perangkat ini:\n' + t.out.trim() +
          '\nPastikan Ubuntu (ubuntu-fs) dan proot berfungsi: ./start.sh status');
        return;
      }
      jlog(job, `    → node ${t.out.trim()} berjalan di PRoot Ubuntu.`);
      if (makeActive) {
        writeConfig({ active: version });
        jlog(job, `✓ ${version} diaktifkan untuk Terminal.`);
      }
      finishJob(job, true, `✓ Node.js ${version} siap dipakai.`);
    } catch (e) {
      finishJob(job, false, '✗ Error: ' + e.message);
    } finally {
      rmrf(tmp);
      installing = false;
    }
  }

  // ------------------------------------------------------------------
  // INFO
  // ------------------------------------------------------------------
  function info() {
    const cfg = readConfig();
    const installed = listInstalled();
    const active = cfg.active && installed.includes(cfg.active) ? cfg.active : '';
    const pre = prerequisites();
    return {
      ok: true,
      system: { version: process.version, bin: process.execPath },
      supported: pre.ok,
      reason: pre.reason,
      arch: os.arch(),
      majors: MAJORS,
      active,
      installing,
      shimDirBase: SHIM_DIR,
      installed: installed.map((v) => ({
        version: v,
        major: parseInt(v.slice(1), 10),
        active: v === active,
        shimDir: shimDir(v),
        apps: appsUsingVersion ? appsUsingVersion(v) : [],
      })),
    };
  }

  // ------------------------------------------------------------------
  // HTTP
  // ------------------------------------------------------------------
  async function handle(req, res, pathname) {
    const m = req.method;
    const fail = (code, message) => sendJSON(res, code, { ok: false, message });

    if (m === 'GET' && pathname === '/api/node/info') {
      sendJSON(res, 200, info());
      return true;
    }

    if (m === 'POST' && pathname === '/api/node/install') {
      try {
        const b = await parseJSONBody(req);
        const major = parseInt(b.major, 10);
        if (!(major >= 16 && major <= 40)) { fail(400, 'Versi major tidak valid.'); return true; }
        if (installing) { fail(409, 'Masih ada instalasi Node yang berjalan.'); return true; }
        const pre = prerequisites();
        if (!pre.ok) { fail(400, pre.reason); return true; }
        installing = true;
        const job = newJob(`Pasang Node ${major}`);
        installMajor(job, major, !!b.activate);
        sendJSON(res, 200, { ok: true, jobId: job.id });
      } catch (e) { installing = false; fail(400, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/node/activate') {
      try {
        const b = await parseJSONBody(req);
        const v = String(b.version || '');
        if (v && !isInstalled(v)) { fail(404, 'Versi belum terpasang.'); return true; }
        writeConfig({ active: v });
        sendJSON(res, 200, {
          ok: true,
          message: v ? `Terminal sekarang memakai Node ${v}. Buka terminal baru / jalankan perintah lagi.` : 'Terminal kembali memakai Node bawaan Termux.',
        });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    if (m === 'POST' && pathname === '/api/node/remove') {
      try {
        const b = await parseJSONBody(req);
        const v = String(b.version || '');
        if (!isInstalled(v)) { fail(404, 'Versi tidak ditemukan.'); return true; }
        const used = appsUsingVersion ? appsUsingVersion(v) : [];
        if (used.length) { fail(409, 'Masih dipakai app: ' + used.join(', ') + '. Ganti versi app itu dulu.'); return true; }
        if (readConfig().active === v) writeConfig({ active: '' });
        rmrf(nodeHome(v));
        rmrf(shimDir(v));
        sendJSON(res, 200, { ok: true, message: `Node ${v} dihapus.` });
      } catch (e) { fail(500, e.message); }
      return true;
    }

    return false;
  }

  return { handle, info, isInstalled, toolCmd, shimDir, shellEnv, VERSION_RE };
};
