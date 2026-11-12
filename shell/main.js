'use strict';

// main.js — shell Electron untuk DSH Web GUI.
//
// Struktur jendela:
//   ┌──────────────────────────────────────────────┐
//   │ strip judul (digambar shell.html)            │  <- drag, min/max/close
//   ├──────────────────────────────────────────────┤
//   │ WebContentsView: halaman DSH Web GUI         │  <- halaman asli, tanpa diubah
//   └──────────────────────────────────────────────┘
//
// Halaman DSH tidak dimodifikasi: ia hidup di view terpisah di bawah strip,
// jadi tidak ada elemen aplikasi yang tertutup tombol jendela.

const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, shell, nativeTheme } = require('electron');

const STRIP_HEIGHT = 36;
const APP_TITLE = 'DeepSeek Harness';

// ── Argumen ──────────────────────────────────────────────────────────────────
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const startURL = argValue('--url') || process.env.DSH_WEB_APP_URL;
if (!startURL) {
  console.error('dsh-web-shell: butuh --url <http://127.0.0.1:PORT/?token=...> atau DSH_WEB_APP_URL');
  app.exit(2);
}

const [widthArg, heightArg] = (argValue('--size') || '1440,900').split(',');
const initialWidth = Number.parseInt(widthArg, 10) || 1440;
const initialHeight = Number.parseInt(heightArg, 10) || 900;
const startMaximized = process.argv.includes('--maximized');
const startFullscreen = process.argv.includes('--fullscreen');
const allowDevTools = process.argv.includes('--devtools') || process.env.DSH_WEB_APP_DEVTOOLS === '1';

let win = null;
let view = null;

// Tema yang dilaporkan halaman DSH (diatur di aplikasi, bukan selalu ikut OS).
// null = halaman belum melapor; sementara pakai tema sistem.
let pageDark = null;

function windowState() {
  return {
    maximized: win ? win.isMaximized() : false,
    fullscreen: win ? win.isFullScreen() : false,
    dark: pageDark === null ? nativeTheme.shouldUseDarkColors : pageDark,
  };
}

function broadcastState() {
  const state = windowState();
  for (const wc of [win?.webContents, view?.webContents]) {
    if (wc && !wc.isDestroyed()) wc.send('shell:window-state', state);
  }
}

// ── Tata letak ───────────────────────────────────────────────────────────────
function layout() {
  if (!win || win.isDestroyed() || !view) return;
  const [w, h] = win.getContentSize();
  const strip = win.isFullScreen() ? 0 : STRIP_HEIGHT;
  view.setBounds({ x: 0, y: strip, width: w, height: Math.max(0, h - strip) });
  if (win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('shell:strip-height', strip);
  }
}

// ── Resize dari tepi jendela ─────────────────────────────────────────────────
// Jendela frameless tidak mendapat handle resize native di Linux, jadi tepi
// jendela ditangani handle transparan di dalam halaman (view-preload.js).
// Delta dihitung dari koordinat pointer di DOM (screenX/screenY), bukan dari
// polling posisi kursor, supaya tetap akurat saat pointer bergerak cepat.
let resizeSession = null;

ipcMain.on('shell:resize-start', (event, payload) => {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
  const { edge, screenX, screenY } = payload || {};
  if (!edge) return;
  resizeSession = {
    edge,
    originX: Number(screenX) || 0,
    originY: Number(screenY) || 0,
    bounds: win.getBounds(),
  };
});

ipcMain.on('shell:resize-move', (event, payload) => {
  if (!resizeSession || !win || win.isDestroyed()) return;
  const { screenX, screenY } = payload || {};
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

  const { edge, originX, originY, bounds } = resizeSession;
  const dx = screenX - originX;
  const dy = screenY - originY;

  let { x, y, width, height } = bounds;
  const minW = 720;
  const minH = 480;

  if (edge.includes('e')) width = Math.max(minW, bounds.width + dx);
  if (edge.includes('s')) height = Math.max(minH, bounds.height + dy);
  if (edge.includes('w')) {
    width = Math.max(minW, bounds.width - dx);
    x = bounds.x + (bounds.width - width);
  }
  if (edge.includes('n')) {
    height = Math.max(minH, bounds.height - dy);
    y = bounds.y + (bounds.height - height);
  }

  win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  // 'resize' bawaan bisa ter-throttle saat drag cepat; sinkronkan langsung.
  layout();
});

ipcMain.on('shell:resize-end', () => {
  resizeSession = null;
  layout();
});

// ── Kontrol jendela ──────────────────────────────────────────────────────────
ipcMain.on('shell:minimize', () => win?.minimize());
ipcMain.on('shell:toggle-maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('shell:close', () => win?.close());
ipcMain.on('shell:request-state', (event) => {
  if (event.sender && !event.sender.isDestroyed()) event.sender.send('shell:window-state', windowState());
});

// Halaman DSH melaporkan tema aslinya; strip judul mengikutinya, bukan tema OS.
ipcMain.on('shell:page-theme', (event, payload) => {
  // Hanya terima dari view halaman DSH, bukan dari jendela lain.
  if (!view || event.sender !== view.webContents) return;
  const dark = !!(payload && payload.dark);
  if (dark === pageDark) return;
  pageDark = dark;

  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(dark ? '#151517' : '#f6f5f3');
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('shell:window-state', windowState());
    }
  }
});

// ── Jendela ──────────────────────────────────────────────────────────────────
function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: dark ? '#151517' : '#f6f5f3',
    title: APP_TITLE,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'shell.html'));

  view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'view-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.contentView.addChildView(view);
  layout();

  view.webContents.setWindowOpenHandler(({ url }) => {
    // Tautan keluar dibuka di browser default, bukan jendela Electron baru.
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(startURL.replace(/\?.*$/, ''))) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Izin: cukup clipboard tulis (dipakai tombol copy di UI). Sisanya ditolak.
  view.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write');
  });

  view.webContents.on('did-finish-load', () => {
    if (win && !win.isVisible()) win.show();
    if (startMaximized) win.maximize();
    if (startFullscreen) win.setFullScreen(true);
    broadcastState();
  });

  // Jaring pengaman: kalau halaman lambat/gagal, jangan biarkan jendela tak tampil.
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }, 6000);

  view.webContents.loadURL(startURL);

  win.on('resize', layout);
  win.on('maximize', () => {
    layout();
    broadcastState();
  });
  win.on('unmaximize', () => {
    layout();
    broadcastState();
  });
  win.on('enter-full-screen', () => {
    layout();
    broadcastState();
  });
  win.on('leave-full-screen', () => {
    layout();
    broadcastState();
  });
  win.on('closed', () => {
    win = null;
    view = null;
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
    if (allowDevTools && input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      view?.webContents.openDevTools({ mode: 'detach' });
    }
  });
}

app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Perubahan tema OS hanya relevan selagi halaman belum melaporkan temanya.
  // Setelah itu halaman yang menentukan (tema DSH diatur di dalam aplikasi).
  nativeTheme.on('updated', () => {
    if (pageDark !== null) return;
    if (win && !win.isDestroyed()) {
      win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#151517' : '#f6f5f3');
    }
    broadcastState();
  });
});

app.on('window-all-closed', () => app.quit());
