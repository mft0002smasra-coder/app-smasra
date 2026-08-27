# SM Arab (Jaim) Al-Asyraf — Panduan Pasang

## Fail dalam pek ini
- `index.html` — muka depan: header hologram, banner carousel, drawer menu, bottom nav
- `pengumuman.html` — modul Pengumuman (senarai + tambah untuk Admin)
- `profile.html` — halaman profil pengguna
- `style.css` — tema hologram hijau futuristik (dikongsi semua muka)
- `app.js` — login (emel & Google), session, drawer, jam, carousel, sambungan API
- `manifest.json` + `service-worker.js` — untuk PWA / Add to Home Screen
- `Code.gs` — kod backend Google Apps Script

## Langkah pasang

**1. Deploy backend (Google Apps Script)**
1. Buka Google Sheet APP SMASRA anda > Extensions > Apps Script
2. Padam kod default, salin-tampal semua kandungan `Code.gs`
3. Deploy > New deployment > ikon gear > Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Deploy, salin URL `.../exec`

**2. Sediakan tab "Banner" untuk slaid muka depan**
1. Dalam Google Sheet, buat tab baru bernama `Banner`
2. Lajur A = link gambar (guna format `https://lh3.googleusercontent.com/d/FILE_ID`)
3. Saiz disyorkan setiap gambar: **1500 x 500 piksel**
4. Baris 1 = header (contoh: "Link"), data bermula baris 2

**3. Sambungkan frontend ke backend**
1. Buka `app.js`
2. Cari `const API_URL = "PASTE_URL_APPS_SCRIPT_ANDA_DI_SINI";` — ganti dengan URL dari langkah 1

**4. (Pilihan) Aktifkan "Sign in with Google"**
1. Pergi ke [Google Cloud Console](https://console.cloud.google.com/) > buat projek baru (atau guna sedia ada)
2. APIs & Services > OAuth consent screen — lengkapkan maklumat asas
3. Credentials > Create Credentials > OAuth client ID > jenis **Web application**
4. Di "Authorized JavaScript origins", tambah domain GitHub Pages awak, contoh:
   `https://username.github.io`
5. Salin Client ID yang diberi
6. Buka `app.js`, ganti `const GOOGLE_CLIENT_ID = "PASTE_GOOGLE_CLIENT_ID_ANDA_DI_SINI...";` dengan Client ID tu
7. **Penting:** butang "Sign in with Google" hanya berfungsi selepas app di-host di domain sebenar (GitHub Pages) — tak akan berfungsi dalam preview tempatan/chat

Kalau langkah ni dilangkau, butang Google tak akan muncul — pengguna tetap boleh log masuk guna emel seperti biasa.

**5. Upload ke GitHub Pages**
1. Buat repo baru di GitHub (Public)
2. Upload SEMUA fail dalam pek ini terus ke root repo
3. Settings > Pages > Branch: main, folder: `/ (root)` > Save
4. Buka URL yang diberi (`https://username.github.io/nama-repo/`)

**6. Test**
1. Log masuk guna emel dalam tab DatabaseSTAFF, atau guna Google Sign-In kalau dah disediakan
2. Kalau role = Admin, butang "+" akan muncul di muka Pengumuman
3. Add to Home Screen untuk pasang sebagai app

## ⚠️ PENTING — bila kod Code.gs berubah
Google Apps Script **tak auto-update** URL Web App yang sedia ada bila awak edit/simpan kod baru. Kena buat "New version" setiap kali:
1. Buka Apps Script > Deploy > **Manage deployments**
2. Klik ikon pensel (edit) pada deployment sedia ada
3. Version: pilih **New version** > Deploy

Kalau tak buat step ni, URL `.../exec` awak akan terus guna kod LAMA walaupun fail Code.gs dah ditukar — ini punca biasa "fungsi baru tak jalan" atau "banner tak keluar macam patut".

## Menyediakan modul Event

**1. Tambah lajur "Role2" di DatabaseSTAFF**
Kolum H (selepas Role) — isi **"Pentadbir"** untuk staf yang dibenarkan tambah event. Kosongkan untuk staf lain.

**2. Buat tab baru "Event" di Google Sheet**
Lajur (baris 1 = header, data bermula baris 2):
`A: Unit | B: TarikhDari | C: TarikhHingga | D: Masa | E: Tajuk | F: Tempat | G: DicatatOleh`

Lajur G (DicatatOleh) diisi automatik oleh sistem — tak perlu isi manual.

Selepas tambah lajur/tab baru ni, **redeploy Apps Script** (Manage deployments > pensil > New version) supaya perubahan Code.gs berkuat kuasa.

## Menyediakan modul Laporan Pentadbir Bertugas

**1. Buat tab baru "LaporanPentadbirBertugas" di Google Sheet**
Lajur (baris 1 = header, data bermula baris 2):
`A: Tarikh | B: Masa | C: BlokKelas | D: Catatan | E: Gambar1 | F: Gambar2 | G: NamaPentadbir | H: DicatatOleh`

**2. Akses terhad kepada Role2 = "Pentadbir"**
Sama seperti modul Event, hanya staf dengan lajur **Role2 (kolum H, DatabaseSTAFF) = "Pentadbir"** boleh buka modul ni. Staf lain akan nampak popup "Akses Terhad".

**3. Gambar disimpan ke Google Drive**
Bila staf muat naik gambar dalam borang, Apps Script akan cipta fail terus dalam **Google Drive akaun pemilik Apps Script** (root folder), set kongsi "Anyone with link", dan simpan pautannya ke Sheet. Boleh alih fail-fail ni ke folder khas kemudian kalau perlu (Apps Script tak perlu ubah, ID fail tak berubah).

**4. Redeploy Apps Script** lepas tambah tab baru ni.

## Nota
- Drawer menu (kiri) dan bottom nav (bawah) guna ikon sahaja tanpa label teks, ikut permintaan reka bentuk
- Bottom nav ada 5 slot — Home, Event, Laporan Pentadbir, Profil aktif
- Muka "Laporan Pentadbir Bertugas" sengaja **tiada header biasa** — guna nav khas sendiri (Kembali/Borang/Senarai/Home) ikut permintaan reka bentuk
- Laporan A4 boleh dimuat turun sebagai PNG (guna pustaka html2canvas dimuat secara dinamik dari CDN)
- Ikon "urus banner" (pensel) pada carousel kelihatan untuk Admin sahaja — belum berfungsi (akan datang)
- Push Notification (FCM) dan modul Laporan Guru/Prestasi akan dibina pada fasa seterusnya
