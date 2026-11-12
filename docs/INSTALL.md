# Panduan instalasi

Panduan rinci untuk memasang DSH Desktop di Linux. Untuk gambaran singkat, lihat
[README](README.id.md).

- [Sebelum mulai](#sebelum-mulai)
- [Jalur 1: npx (tanpa memasang)](#jalur-1-npx-tanpa-memasang)
- [Jalur 2: npm global (disarankan)](#jalur-2-npm-global-disarankan)
- [Jalur 3: dari source](#jalur-3-dari-source)
- [Jalur 4: offline / mirror](#jalur-4-offline--mirror)
- [Memasang tab Git](#memasang-tab-git)
- [Verifikasi](#verifikasi)
- [Catatan per distro](#catatan-per-distro)
- [Mencabut](#mencabut)

---

## Sebelum mulai

### 1. Node.js 20 atau lebih baru

```bash
node --version     # harus v20.x atau lebih tinggi
```

Kalau belum ada, pakai [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec bash
nvm install 22
nvm use 22
```

### 2. DeepSeek Harness

```bash
npm install -g @deepseek-ai/dsh
dsh --version          # harus 0.2.x
```

### 3. Compositor dan sesi

Paket ini bekerja di Wayland maupun X11. Cek tipe sesi Anda:

```bash
echo "$XDG_SESSION_TYPE"     # "wayland" atau "x11"
```

Tidak perlu konfigurasi khusus. Launcher mencoba Wayland lebih dulu, lalu X11,
lalu jendela Chrome `--app`.

### 4. Ruang disk

Runtime Electron sekitar 350 MB (unduhan ~275 MB + ekstrak). Pastikan tersedia.

---

## Jalur 1: npx (tanpa memasang)

Cara tercepat untuk mencoba:

```bash
npx dsh-headless-desktop-for-linux
```

Yang terjadi: npm mengunduh paket, Electron beserta runtime-nya diunduh saat
pertama dijalankan, lalu launcher menyalakan server DSH dan membuka jendela.

**Cocok bila:** Anda ingin melihat dulu sebelum berkomitmen.
**Kurang cocok bila:** Anda ingin entri menu aplikasi. Untuk itu, pakai Jalur 2.

Menjalankan ulang setelah npm membersihkan cache akan mengunduh ulang Electron.

---

## Jalur 2: npm global (disarankan)

```bash
npm install -g dsh-headless-desktop-for-linux
dsh-desktop install
```

`dsh-desktop install` melakukan empat hal:

| Langkah | Lokasi |
|---|---|
| Launcher | `~/.local/bin/dsh-desktop` |
| Ikon (8 ukuran + SVG) | `~/.local/share/icons/hicolor/*/apps/` |
| Entri menu | `~/.local/share/applications/dsh-desktop.desktop` |
| Opsional: plugin Git | profil DSH (dengan `--with-git-plugin`) |

Setelah itu **DSH Desktop** ada di menu aplikasi Anda.

### Kalau `dsh-desktop` tidak ditemukan

`~/.local/bin` harus ada di `PATH`. Kebanyakan distro menambahkannya lewat
`~/.profile`, tetapi shell yang sudah berjalan belum memuatnya:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
exec bash
command -v dsh-desktop
```

Alternatif tanpa menyentuh `PATH`:

```bash
npx dsh-headless-desktop-for-linux
```

### Opsi pemasangan

```bash
dsh-desktop install --with-git-plugin        # sekalian tab Git
dsh-desktop install --with-git-plugin --profile web
```

---

## Jalur 3: dari source

Untuk mencoba versi `main`, atau mengerjakan paketnya.

```bash
git clone https://github.com/jejeprananda/dsh-headless-desktop-for-linux
cd dsh-headless-desktop-for-linux
npm install
node bin/dsh-desktop.mjs doctor
node bin/dsh-desktop.mjs start
```

`npm install` mengunduh Electron 41.4.0 dan runtime-nya (dependensi `electron`
versi ini masih mengunduh binary lewat `postinstall`).

Untuk memasang versi source ini ke menu aplikasi:

```bash
node bin/dsh-desktop.mjs install
```

Launcher yang dipasang menunjuk ke folder clone ini, jadi `git pull` langsung
berlaku tanpa memasang ulang.

### Kalau `postinstall` Electron dilewati

Beberapa konfigurasi npm mematikan script instalasi (`ignore-scripts=true`).
Gejalanya: `doctor` melaporkan binary Electron tidak ada. Perbaiki dengan:

```bash
node node_modules/electron/install.js
node bin/dsh-desktop.mjs doctor
```

---

## Jalur 4: offline / mirror

Instalasi normal butuh internet untuk dua hal: paket npm, dan binary Electron.
Di jaringan terbatas, arahkan keduanya ke mirror.

### Mirror Electron

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install -g dsh-headless-desktop-for-linux
```

### Memasang dari tarball

Berguna untuk menyebar ke mesin tanpa akses npm:

```bash
# di mesin yang punya internet
npm pack dsh-headless-desktop-for-linux     # menghasilkan .tgz ~266 KB
# (binary Electron TIDAK termasuk — diunduh saat install)

# di mesin target
npm install -g ./dsh-headless-desktop-for-linux-0.1.0.tgz
dsh-desktop install
```

### Benar-benar tanpa internet

Salin juga binary Electron dari mesin lain, lalu tunjuk manual:

```bash
# mesin sumber
node -e "console.log(require('electron'))"     # path ke binary

# mesin target
dsh-desktop start          # dengan DSH_WEB_APP_BROWSER=/path/ke/electron
```

Atau lebih sederhana: pakai fallback Chrome, yang memakai Chrome yang sudah
terpasang:

```bash
DSH_WEB_APP_WINDOW=app dsh-desktop
```

---

## Memasang tab Git

Tab Git adalah paket terpisah, `dsh-git-tab`. Tiga cara:

### Lewat halaman Plugins (paling mudah)

DSH → **Plugins** → **Add plugin** → ketik `dsh-git-tab` → Install.

### Lewat CLI

```bash
dsh plugin --profile web add dsh-git-tab
```

Ganti `web` bila Anda memakai profil lain.

### Dari source lokal

```bash
dsh plugin --profile web add "$PWD/packages/dsh-git-tab"
```

**Restart DSH sepenuhnya.** Bundle dimuat saat startup; tab tidak akan muncul
pada sesi yang sedang berjalan.

Setelah restart: buka sidebar kanan → pilih **Git** di halaman guide.

### Kalau tab tetap tidak muncul

```bash
dsh --profile web --dump-config | grep git-tab    # apakah baris bundle ada
dsh plugin --profile web list | grep git-tab      # apakah paket terpasang
dsh --version                                     # harus 0.2.x
```

Ingat juga: tab ini butuh **Session**. Tanpa Session terpilih, sidebar kanan
tidak punya tempat untuk dibuka.

---

## Verifikasi

Setelah memasang, pastikan semuanya benar-benar bekerja.

### 1. Diagnosa lingkungan

```bash
dsh-desktop doctor
```

Semua baris harus `ok`. Baris `warn` pada sandbox itu normal (lihat
[Keamanan](../README.id.md#keamanan)).

### 2. Jendela

```bash
dsh-desktop --debug
```

Yang seharusnya terlihat:

- Jendela terbuka **tanpa** title bar GNOME.
- Strip tipis di atas dengan tulisan `DEEPSEEK HARNESS` dan tiga tombol.
- GUI DSH normal di bawahnya.

Uji manual:

| Aksi | Hasil yang diharapkan |
|---|---|
| Drag strip | Jendela bergerak |
| Dobel-klik strip | Maximize, ikon tombol berubah |
| Drag tepi kanan | Jendela melebar |
| `F11` | Fullscreen, strip hilang |
| Klik tombol × | Jendela tutup |

### 3. Server ikut mati

Setelah menutup jendela:

```bash
tail -5 ~/.local/state/dsh-desktop/dsh-desktop.log
```

Harus ada baris `tidak ada jendela tersisa, menghentikan server`.

### 4. Tab Git

Buka sidebar kanan. Kartu **Git** harus muncul bersama "Workspace files" dan
"New terminal". Klik → tab Git terbuka, menampilkan repository di bawah root
workspace.

### 5. Tampilan tema

Settings → Appearance → ganti Light/Dark. Strip judul harus ikut berubah bersama
halaman, tanpa perlu restart.

---

## Catatan per distro

### Debian / Ubuntu

Tidak ada dependensi tambahan. Chrome atau Chromium biasanya sudah ada
(`google-chrome-stable` atau `chromium`) dan dipakai sebagai fallback.

Paket validasi opsional yang dipakai `install`:

```bash
sudo apt install desktop-file-utils
```

### Fedora

Sama seperti Debian. Untuk Chrome, gunakan repo resmi Google, atau andalkan
Chromium bawaan.

### Arch / Manjaro

Chromium tersedia di repo resmi. Ikon dan entri menu ditangani tanpa langkah
tambahan.

### Wayland (GNOME, KDE, Hyprland, Sway)

Launcher mencoba Wayland dulu. Di Sway/Hyprland yang tidak mengekspos beberapa
protokol, Electron sering harus jatuh ke X11 — itu otomatis dan tidak perlu
tindakan. Kalau Anda ingin memaksa:

```bash
DSH_WEB_APP_WINDOW=app dsh-desktop      # jendela Chrome, selalu bekerja
```

### Desktop ringan (XFCE, LXQt, i3)

Bekerja. `notify-send` dipakai untuk notifikasi kegagalan bila tersedia; tanpa
itu launcher tetap berjalan dan menulis log.

---

## Mencabut

### Cabut aplikasi

```bash
dsh-desktop uninstall
```

Menghapus launcher, entri menu, dan semua ikon. Konfigurasi Anda di
`~/.config/dsh-desktop/config.env` **sengaja dibiarkan** — hapus manual bila
tidak diperlukan.

### Cabut paket npm

```bash
npm uninstall -g dsh-headless-desktop-for-linux
```

### Cabut tab Git

```bash
dsh plugin --profile web remove dsh-git-tab
```

Atau lewat halaman Plugins → cari `dsh-git-tab` → Uninstall.

Restart DSH setelah mencabut.

### Membersihkan sisa

```bash
rm -rf ~/.local/state/dsh-desktop ~/.config/dsh-desktop
```

Data DSH Anda (`~/.dsh` — sesi, workspace, kredensial) **tidak disentuh** oleh
paket ini dalam kondisi apa pun.
