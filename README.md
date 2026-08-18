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

## Nota
- Drawer menu (kiri) dan bottom nav (bawah) guna ikon sahaja tanpa label teks, ikut permintaan reka bentuk
- Bottom nav ada 5 slot — 2 aktif buat masa ini (Home, Profil), 3 lagi placeholder untuk modul akan datang
- Ikon "urus banner" (pensel) pada carousel kelihatan untuk Admin sahaja — belum berfungsi (akan datang)
- Push Notification (FCM) dan modul lain (Kehadiran, Laporan, Prestasi) akan dibina pada fasa seterusnya
