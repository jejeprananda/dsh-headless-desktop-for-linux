'use strict';

// view-preload.js — berjalan di dalam halaman DSH (isolated world, sandbox).
//
// Dua tugas saja:
//   1. Menyediakan bridge window.dshShell (minimize / maximize / close + state).
//      Halaman tidak mendapat akses Node, fs, atau IPC bebas.
//   2. Menyediakan handle resize di tepi jendela, karena jendela frameless di
//      Wayland/GNOME tidak selalu memberi handle native.
//
// Elemen yang disisipkan ditandai data-dsh-shell; pointer-events hanya aktif di
// tepi, jadi interaksi normal aplikasi tidak terganggu.

const { contextBridge, ipcRenderer } = require('electron');

// ── Bridge kontrol jendela ───────────────────────────────────────────────────
const listeners = new Set();

function emitState(state) {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* kesalahan di kode halaman tidak boleh menghentikan shell */
    }
  }
}

ipcRenderer.on('shell:window-state', (_event, state) => emitState(state));

contextBridge.exposeInMainWorld('dshShell', {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('shell:minimize'),
  toggleMaximize: () => ipcRenderer.send('shell:toggle-maximize'),
  close: () => ipcRenderer.send('shell:close'),
  onWindowState(callback) {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    ipcRenderer.send('shell:request-state');
    return () => listeners.delete(callback);
  },
});

// ── Handle resize tepi ───────────────────────────────────────────────────────
const HANDLES = [
  { edge: 'n', css: 'top:0;left:0;right:0;height:6px;cursor:ns-resize' },
  { edge: 's', css: 'bottom:0;left:0;right:0;height:6px;cursor:ns-resize' },
  { edge: 'w', css: 'top:0;bottom:0;left:0;width:6px;cursor:ew-resize' },
  { edge: 'e', css: 'top:0;bottom:0;right:0;width:6px;cursor:ew-resize' },
  { edge: 'nw', css: 'top:0;left:0;width:14px;height:14px;cursor:nwse-resize' },
  { edge: 'ne', css: 'top:0;right:0;width:14px;height:14px;cursor:nesw-resize' },
  { edge: 'sw', css: 'bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize' },
  { edge: 'se', css: 'bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize' },
];

let maximized = false;
let fullscreen = false;
let root = null;

function applyVisibility() {
  if (root) root.style.display = maximized || fullscreen ? 'none' : 'block';
}

function buildHandles() {
  if (root || !document.documentElement) return;
  root = document.createElement('div');
  root.dataset.dshShell = 'resize-handles';
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';

  for (const { edge, css } of HANDLES) {
    const el = document.createElement('div');
    el.dataset.dshShell = 'resize-handle';
    el.style.cssText = `position:fixed;${css};pointer-events:auto;background:transparent`;
    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* capture opsional */
      }
      ipcRenderer.send('shell:resize-start', {
        edge,
        screenX: event.screenX,
        screenY: event.screenY,
      });

      const move = (ev) => ipcRenderer.send('shell:resize-move', { screenX: ev.screenX, screenY: ev.screenY });
      const end = () => {
        ipcRenderer.send('shell:resize-end');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
    root.appendChild(el);
  }

  document.documentElement.appendChild(root);
  applyVisibility();
}

ipcRenderer.on('shell:window-state', (_event, state) => {
  maximized = !!state.maximized;
  fullscreen = !!state.fullscreen;
  applyVisibility();
});

// ── Tema: laporkan tema halaman yang sebenarnya ke shell ─────────────────────
// Tema DSH diatur di dalam aplikasi (Settings → Theme), bukan selalu mengikuti
// OS. Strip judul harus ikut halaman, bukan ikut sistem, supaya tidak belang.
function pageIsDark() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;

  // Fallback: nilai color-scheme, lalu kecerahan warna latar <body>.
  const scheme = getComputedStyle(document.documentElement).colorScheme || '';
  if (scheme.includes('dark') && !scheme.includes('light')) return true;
  if (scheme.includes('light') && !scheme.includes('dark')) return false;

  const bg = getComputedStyle(document.body).backgroundColor || '';
  const m = bg.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }
  return true;
}

let lastDark = null;

function reportTheme() {
  const dark = pageIsDark();
  if (dark === lastDark) return;
  lastDark = dark;
  ipcRenderer.send('shell:page-theme', { dark });
}

function watchTheme() {
  reportTheme();

  // DSH mengganti tema lewat atribut/kelas di <html>, jadi amati keduanya.
  const observer = new MutationObserver(reportTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });
  if (document.body) {
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  // Jaring pengaman untuk perubahan yang tidak lewat atribut (mis. CSS vars).
  setInterval(reportTheme, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    buildHandles();
    watchTheme();
  }, { once: true });
} else {
  buildHandles();
  watchTheme();
}
