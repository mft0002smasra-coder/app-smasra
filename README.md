# APP SMASRA — Panduan Pasang

## Fail dalam pek ini
- `index.html` — muka depan + menu
- `pengumuman.html` — modul Pengumuman (siap penuh)
- `style.css` — tema hologram biru (dikongsi semua muka)
- `app.js` — login, session, sambungan API (dikongsi semua muka)
- `manifest.json` + `service-worker.js` — untuk PWA / Add to Home Screen
- `Code.gs` — kod backend Google Apps Script

## Langkah pasang (ikut urutan)

**1. Deploy backend (Google Apps Script)**
1. Buka Google Sheet APP SMASRA anda
2. Extensions > Apps Script
3. Padam kod default, salin-tampal semua kandungan `Code.gs`
4. Deploy > New deployment > ikon gear > Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Deploy, salin URL `.../exec` yang diberi

**2. Sambungkan frontend ke backend**
1. Buka `app.js`
2. Cari baris `const API_URL = "PASTE_URL_APPS_SCRIPT_ANDA_DI_SINI";`
3. Ganti dengan URL yang disalin tadi

**3. Upload ke GitHub Pages**
1. Buat repo baru di GitHub (Public)
2. Upload SEMUA fail dalam pek ini terus ke root repo (jangan letak dalam folder)
3. Settings > Pages > Branch: main, folder: `/ (root)` > Save
4. Buka URL yang diberi (`https://username.github.io/nama-repo/`)

**4. Test**
1. Buka URL tu di telefon, log masuk guna emel yang ada dalam tab DatabaseSTAFF (Emel 1 atau Emel 2)
2. Kalau role = Admin, butang "+" akan muncul di muka Pengumuman
3. Add to Home Screen untuk pasang sebagai app

## Nota
- Ikon PWA guna terus link logo dari Google Drive — cukup untuk MVP, tapi idealnya generate ikon PNG sebenar 192x192 & 512x512 kelak untuk kualiti lebih baik.
- Push Notification (FCM) belum disambung lagi — ini boleh ditambah pada fasa lepas ni.
- Modul lain (Kehadiran Staf/Murid, Laporan, Prestasi) akan dibina ikut corak sama seperti Pengumuman.
