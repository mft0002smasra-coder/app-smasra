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

Modul ni guna **projek Apps Script + Google Sheet + folder Drive berasingan** (sama corak dengan Kehadiran Murid), supaya tak sentuh backend app utama.

**1. Google Sheet "List Laporan"**
- Sheet: `https://docs.google.com/spreadsheets/d/16DsM_I0pRsQ41gFVRWHTk8XDbDn8M7LOkiWGPin1fPQ/edit`
- Tab mesti bernama tepat: **List Laporan**
- Lajur (baris 1 = header rujukan, kod baca ikut turutan lajur A–J):
  `A:ID | B:Tarikh | C:Masa | D:NamaPentadbir | E:BlokKelas | F:Catatan | G:Gambar1 | H:Gambar2 | I:DicatatOleh | J:MasaHantar`

**2. Folder Google Drive untuk gambar**
- Folder: `https://drive.google.com/drive/folders/1c1kgKvFVz2v6lbW7Tm4xS0sJj9Dalef8`
- Pastikan akaun Google yang akan "Execute as: Me" semasa deploy ada akses **Editor** ke folder ni.

**3. Deploy backend**
1. Buka Google Sheet "List Laporan" > Extensions > Apps Script > **New project** (projek BAHARU, jangan guna projek sedia ada)
2. Padam kod default, salin-tampal semua kandungan `Code-LaporanPentadbir.gs`
3. Deploy > New deployment > ikon gear > Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Deploy, salin URL `.../exec`

**4. Sambungkan frontend**
1. Buka `laporan-pentadbir.js`
2. Cari `const LPB_API_URL = "PASTE_URL_APPS_SCRIPT_LAPORAN_PENTADBIR_DI_SINI";` — ganti dengan URL dari langkah 3

**5. Muat naik fail baharu ke GitHub Pages**
Upload `laporan-pentadbir.html` dan `laporan-pentadbir.js` (dan `style.css`, `app.js`, `service-worker.js` yang dikemaskini) ke root repo, ganti fail lama.

**Nota penting:**
- Senarai laporan dikumpul ikut **Nama Pentadbir + Tarikh** — kalau seorang pentadbir isi borang beberapa kali (beberapa blok/kelas) pada tarikh sama, semua rekod tu akan digabung jadi **satu laporan** dalam senarai & dalam jadual PDF/PNG.
- Padam laporan akan padam **semua baris** bagi Nama+Tarikh tersebut (dan cuba padam gambar berkaitan di Drive), selepas pengesahan.
- Muat turun laporan guna `html2canvas` (dimuatkan dari CDN) untuk hasilkan fail `.png` bersaiz A4 potrait.
- Bila kod `Code-LaporanPentadbir.gs` diubah & disimpan semula, WAJIB buat **New version** di Manage deployments (rujuk amaran di atas), atau URL lama akan terus guna kod lama.

## Nota
- Drawer menu (kiri) dan bottom nav (bawah) guna ikon sahaja tanpa label teks, ikut permintaan reka bentuk
- Bottom nav ada 5 slot — Home, Event, Profil aktif; 2 lagi placeholder untuk modul akan datang
- Ikon "urus banner" (pensel) pada carousel kelihatan untuk Admin sahaja — belum berfungsi (akan datang)
- Push Notification (FCM) dan modul Laporan/Prestasi akan dibina pada fasa seterusnya
