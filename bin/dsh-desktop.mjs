#!/usr/bin/env node
// bin/dsh-desktop.mjs — entry CLI paket dsh-headless-desktop-for-linux.
//
// Tugasnya hanya orkestrasi: cari launcher bash paket ini, teruskan opsi, dan
// sediakan `install` / `uninstall` / `doctor`. Logika jendela yang sudah teruji
// tetap di launcher bash + shell Electron; CLI tidak menduplikasinya.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const LAUNCHER = path.join(PKG_ROOT, 'launcher', 'dsh-web-app');
const SHELL_DIR = path.join(PKG_ROOT, 'shell');
const ICON_SRC = path.join(PKG_ROOT, 'icons');
const DESKTOP_TEMPLATE = path.join(PKG_ROOT, 'desktop', 'dsh-desktop.desktop.in');
const PLUGIN_TARBALL = path.join(PKG_ROOT, 'packages', 'dsh-git-tab');

const APP_ID = 'dsh-desktop';
const HOME = os.homedir();
const BIN_DIR = path.join(HOME, '.local', 'bin');
const APP_DIR = path.join(HOME, '.local', 'share', 'applications');
const DATA_DIR = path.join(HOME, '.local', 'share', APP_ID);
const ICON_BASE = path.join(HOME, '.local', 'share', 'icons', 'hicolor');
const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'),
  APP_ID,
);

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

const C = process.stdout.isTTY
  ? { b: '\x1b[1m', dim: '\x1b[2m', blue: '\x1b[34m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m' }
  : { b: '', dim: '', blue: '', green: '', yellow: '', red: '', reset: '' };

const info = (msg) => console.log(`${C.blue}==>${C.reset} ${msg}`);
const ok = (msg) => console.log(`${C.green}  ok${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}  !!${C.reset} ${msg}`);
const die = (msg) => {
  console.error(`${C.red}error${C.reset} ${msg}`);
  process.exit(1);
};

function has(cmd) {
  const r = spawnSync('sh', ['-c', `command -v ${JSON.stringify(cmd)}`], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() !== '';
}

/** Direktori binary Electron dari dependency npm, atau undefined. */
function electronBinary() {
  try {
    // Modul `electron` mengembalikan path binary-nya.
    const req = createRequire(import.meta.url);
    const bin = req('electron');
    if (typeof bin === 'string' && fs.existsSync(bin)) return bin;
  } catch {
    /* dependency belum terpasang atau install.js gagal */
  }
  const fallback = path.join(PKG_ROOT, 'node_modules', 'electron', 'dist', 'electron');
  return fs.existsSync(fallback) ? fallback : undefined;
}

/** Path `dsh` bila bisa ditemukan lewat PATH. */
function dshBinary() {
  const r = spawnSync('sh', ['-c', 'command -v dsh'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

const HELP = `
${C.b}dsh-desktop${C.reset} — DeepSeek Harness sebagai jendela desktop Linux (tanpa header OS)

${C.b}USAGE${C.reset}
  dsh-desktop [start] [options]     Buka jendela (default)
  dsh-desktop install [options]     Pasang ke menu aplikasi + ikon
  dsh-desktop uninstall             Cabut semua yang dipasang
  dsh-desktop doctor                Periksa dependensi & lingkungan
  dsh-desktop --help | --version

${C.b}START OPTIONS${C.reset}
  --profile <nama>      Profil DSH (default: ${C.dim}web${C.reset})
  --port <n>            Port server (default: ${C.dim}3080${C.reset}; 0 = acak)
  --window <mode>       ${C.dim}shell${C.reset} (frameless) | ${C.dim}app${C.reset} (Chrome) | ${C.dim}browser${C.reset}
  --size <WxH>          Ukuran jendela awal (default: ${C.dim}1440x900${C.reset})
  --maximized           Buka dalam keadaan maximize
  --debug               Tampilkan log launcher di stderr

${C.b}INSTALL OPTIONS${C.reset}
  --with-git-plugin     Ikut pasang plugin Git (dsh-git-tab) ke profil DSH
  --profile <nama>      Profil target saat --with-git-plugin (default: ${C.dim}web${C.reset})

${C.b}EXAMPLES${C.reset}
  npx dsh-headless-desktop-for-linux
  npm i -g dsh-headless-desktop-for-linux && dsh-desktop install --with-git-plugin
  dsh-desktop start --window app --size 1280x800

${C.b}CONFIG${C.reset}
  ${CONFIG_DIR}/config.env — variabel DSH_WEB_APP_* (dibaca oleh launcher).
`;

function parseStartOptions(argv) {
  const opts = { passthrough: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) die(`opsi ${arg} butuh nilai`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--profile': opts.profile = next(); break;
      case '--port': opts.port = next(); break;
      case '--window': opts.window = next(); break;
      case '--size': opts.size = next().replace('x', ','); break;
      case '--maximized': opts.maximized = true; break;
      case '--debug': opts.debug = true; break;
      default:
        if (arg.startsWith('-')) die(`opsi tidak dikenal: ${arg}`);
        opts.passthrough.push(arg);
    }
  }
  return opts;
}

function startCommand(argv) {
  if (!fs.existsSync(LAUNCHER)) die(`launcher tidak ditemukan: ${LAUNCHER}`);

  const opts = parseStartOptions(argv);
  const env = { ...process.env, DSH_WEB_APP_ROOT: PKG_ROOT };

  const bin = electronBinary();
  if (bin) env.DSH_WEB_APP_ELECTRON_BIN = bin;
  else warn('binary Electron tidak ditemukan — akan jatuh kembali ke jendela Chrome. Jalankan `dsh-desktop doctor`.');

  if (opts.profile) env.DSH_WEB_APP_PROFILE = opts.profile;
  if (opts.port !== undefined) env.DSH_WEB_APP_PORT = opts.port;
  if (opts.window) env.DSH_WEB_APP_WINDOW = opts.window;
  if (opts.size) env.DSH_WEB_APP_SIZE = opts.size;
  if (opts.maximized) env.DSH_WEB_APP_MAXIMIZED = '1';
  if (opts.debug) env.DSH_WEB_APP_DEBUG = '1';

  const child = spawn('bash', [LAUNCHER], { stdio: 'inherit', env });
  const forward = (sig) => child.kill(sig);
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function installCommand(argv) {
  const withGit = argv.includes('--with-git-plugin');
  const profileIdx = argv.indexOf('--profile');
  const profile = profileIdx >= 0 ? argv[profileIdx + 1] : 'web';

  info('Memasang DSH Desktop');

  if (!fs.existsSync(LAUNCHER)) die(`launcher tidak ditemukan: ${LAUNCHER}`);
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // 1. Launcher wrapper: menunjuk launcher paket, bukan salinan, supaya update
  //    paket langsung terpakai tanpa memasang ulang.
  const wrapper = path.join(BIN_DIR, APP_ID);
  fs.writeFileSync(
    wrapper,
    `#!/usr/bin/env bash\n# Dibuat oleh \`dsh-desktop install\` — jangan diedit manual.\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(PKG_ROOT, 'bin', 'dsh-desktop.mjs'))} start "$@"\n`,
    { mode: 0o755 },
  );
  ok(`launcher -> ${wrapper}`);

  // 2. Ikon ke tema hicolor (system-wide untuk user).
  let iconCount = 0;
  for (const size of ICON_SIZES) {
    const src = path.join(ICON_SRC, `dsh-desktop-${size}.png`);
    if (!fs.existsSync(src)) continue;
    const dir = path.join(ICON_BASE, `${size}x${size}`, 'apps');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, `${APP_ID}.png`));
    iconCount += 1;
  }
  const svgSrc = path.join(ICON_SRC, 'dsh-desktop.svg');
  if (fs.existsSync(svgSrc)) {
    const dir = path.join(ICON_BASE, 'scalable', 'apps');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(svgSrc, path.join(dir, `${APP_ID}.svg`));
  }
  ok(`ikon -> ${ICON_BASE} (${iconCount} ukuran + svg)`);

  // 3. Desktop entry dari template, dengan path terisi.
  if (fs.existsSync(DESKTOP_TEMPLATE)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
    const entry = fs
      .readFileSync(DESKTOP_TEMPLATE, 'utf8')
      .replaceAll('@BIN@', wrapper)
      .replaceAll('@ICON@', APP_ID);
    fs.writeFileSync(path.join(APP_DIR, `${APP_ID}.desktop`), entry, { mode: 0o644 });
    ok(`shortcut -> ${path.join(APP_DIR, `${APP_ID}.desktop`)}`);

    if (has('desktop-file-validate')) {
      const v = spawnSync('desktop-file-validate', [path.join(APP_DIR, `${APP_ID}.desktop`)], { encoding: 'utf8' });
      if (v.status !== 0 && v.stderr.trim()) warn(`desktop-file-validate: ${v.stderr.trim()}`);
    }
  } else {
    warn('template .desktop tidak ditemukan; shortcut aplikasi dilewati.');
  }

  for (const cmd of [['gtk-update-icon-cache', ['-f', '-t', ICON_BASE]], ['update-desktop-database', [APP_DIR]]]) {
    if (has(cmd[0])) spawnSync(cmd[0], cmd[1], { stdio: 'ignore' });
  }

  // 4. Plugin Git opsional.
  if (withGit) installGitPlugin(profile);

  console.log('');
  ok('Selesai. Cari "DSH Desktop" di menu aplikasi, atau jalankan `dsh-desktop`.');
  console.log(`   ${C.dim}Konfig : ${path.join(CONFIG_DIR, 'config.env')}${C.reset}`);
  console.log(`   ${C.dim}Cabut  : dsh-desktop uninstall${C.reset}`);
}

function installGitPlugin(profile) {
  const dsh = dshBinary();
  if (!dsh) {
    warn('`dsh` tidak ada di PATH; plugin Git dilewati.');
    warn(`Pasang manual: dsh plugin --profile ${profile} add dsh-git-tab`);
    return;
  }
  if (!fs.existsSync(path.join(PLUGIN_TARBALL, 'package.json'))) {
    warn('paket plugin dsh-git-tab tidak ada di dalam paket ini; dilewati.');
    return;
  }
  info(`Memasang plugin Git ke profil "${profile}"`);
  const r = spawnSync(dsh, ['plugin', '--profile', profile, 'add', PLUGIN_TARBALL], { stdio: 'inherit' });
  if (r.status === 0) ok('plugin Git terpasang — restart DSH agar tab muncul.');
  else warn('pemasangan plugin Git gagal; lihat pesan di atas.');
}

function uninstallCommand() {
  info('Mencabut DSH Desktop');
  const targets = [
    path.join(BIN_DIR, APP_ID),
    path.join(APP_DIR, `${APP_ID}.desktop`),
    path.join(ICON_BASE, 'scalable', 'apps', `${APP_ID}.svg`),
    ...ICON_SIZES.map((s) => path.join(ICON_BASE, `${s}x${s}`, 'apps', `${APP_ID}.png`)),
  ];
  for (const t of targets) {
    if (fs.existsSync(t)) {
      fs.rmSync(t, { force: true });
      ok(`hapus ${t}`);
    }
  }
  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    ok(`hapus ${DATA_DIR}`);
  }
  for (const cmd of [['gtk-update-icon-cache', ['-f', '-t', ICON_BASE]], ['update-desktop-database', [APP_DIR]]]) {
    if (has(cmd[0])) spawnSync(cmd[0], cmd[1], { stdio: 'ignore' });
  }
  if (fs.existsSync(CONFIG_DIR)) {
    warn(`konfigurasi tetap disimpan di ${CONFIG_DIR} (hapus manual bila mau).`);
  }
  ok('Selesai dicabut.');
}

function doctorCommand() {
  info('Memeriksa lingkungan');
  const rows = [];
  const check = (label, fn) => {
    try {
      const result = fn();
      rows.push([result ? 'ok' : 'FAIL', label, result || '']);
    } catch (err) {
      rows.push(['FAIL', label, err.message]);
    }
  };

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  check(`Node.js >= 20 (kamu: ${process.versions.node})`, () => nodeMajor >= 20);

  check('Perintah `dsh`', () => dshBinary());
  check('Launcher paket', () => (fs.existsSync(LAUNCHER) ? LAUNCHER : false));
  check('Aset shell (main.js + shell.html)', () =>
    fs.existsSync(path.join(SHELL_DIR, 'main.js')) && fs.existsSync(path.join(SHELL_DIR, 'shell.html')));

  const bin = electronBinary();
  if (bin) {
    check('Binary Electron', () => bin);

    // Chromium menolak start bila chrome-sandbox bukan SUID milik root. Launcher
    // menambahkan --no-sandbox dalam kasus itu, jadi di sini cukup dilaporkan.
    const sandboxHelper = path.join(path.dirname(bin), 'chrome-sandbox');
    let suid = false;
    try {
      const st = fs.statSync(sandboxHelper);
      suid = st.uid === 0 && (st.mode & 0o4000) !== 0;
    } catch {
      /* helper tidak ada */
    }

    const args = suid ? ['--version'] : ['--no-sandbox', '--version'];
    const v = spawnSync(bin, args, { encoding: 'utf8', timeout: 20000 });
    check('Electron --version', () => (v.status === 0 ? v.stdout.trim().split('\n').pop() : false));
    rows.push([
      'ok',
      'Sandbox Chromium',
      suid ? 'SUID aktif' : 'tidak SUID — launcher otomatis memakai --no-sandbox',
    ]);
  } else {
    rows.push(['WARN', 'Binary Electron', 'belum ada — jalankan: node node_modules/electron/install.js']);
  }

  const chrome = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'].find(has);
  rows.push([chrome ? 'ok' : 'WARN', 'Browser Chromium (fallback)', chrome || 'tidak ada — fallback tidak tersedia']);

  const session = process.env.XDG_SESSION_TYPE || 'tidak diketahui';
  rows.push(['ok', 'Tipe sesi', session]);
  rows.push([
    'ok',
    'Backend jendela',
    process.env.WAYLAND_DISPLAY ? `wayland (${process.env.WAYLAND_DISPLAY})` : process.env.DISPLAY ? `x11 (${process.env.DISPLAY})` : 'tidak terdeteksi',
  ]);

  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
  rows.push(['ok', 'Versi paket', pkg.version]);

  console.log('');
  for (const [state, label, detail] of rows) {
    const tag =
      state === 'ok' ? `${C.green}ok  ${C.reset}` : state === 'WARN' ? `${C.yellow}warn${C.reset}` : `${C.red}FAIL${C.reset}`;
    console.log(`  ${tag}  ${label}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
  }
  console.log('');
  if (rows.some(([s]) => s === 'FAIL')) {
    console.log(`${C.yellow}Ada pemeriksaan yang gagal. Perbaiki dulu sebelum menjalankan jendela.${C.reset}`);
    process.exitCode = 1;
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case undefined:
  case 'start':
    startCommand(rest);
    break;
  case 'install':
    installCommand(rest);
    break;
  case 'uninstall':
  case 'remove':
    uninstallCommand();
    break;
  case 'doctor':
    doctorCommand();
    break;
  case '--help':
  case '-h':
  case 'help':
    console.log(HELP);
    break;
  case '--version':
  case '-v':
    console.log(JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version);
    break;
  default:
    die(`perintah tidak dikenal: ${command}\nJalankan \`dsh-desktop --help\`.`);
}
