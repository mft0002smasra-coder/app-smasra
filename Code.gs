/**
 * APP SMASRA — Backend Google Apps Script
 * -----------------------------------------
 * Cara pasang:
 * 1. Buka Google Sheet APP SMASRA > Extensions > Apps Script
 * 2. Padam kod default, paste SEMUA kod ni
 * 3. Klik Deploy > New deployment > pilih ikon gear > "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Deploy, salin URL yang diberi (.../exec)
 * 5. Paste URL tu ke pembolehubah API_URL dalam fail app.js
 */

var SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";

// Lajur dalam tab DatabaseSTAFF (bermula 0): Gambar, Nama, Jawatan, Telefon, Emel1, Emel2, Role
var COL_GAMBAR = 0;
var COL_NAMA = 1;
var COL_JAWATAN = 2;
var COL_TELEFON = 3;
var COL_EMEL1 = 4;
var COL_EMEL2 = 5;
var COL_ROLE = 6;
var COL_ROLE2 = 7;

function doGet(e) {
  var action = e.parameter.action;
  if (action === "getUser") return getUser(e.parameter.email);
  if (action === "getPengumuman") return getPengumuman();
  if (action === "getBanner") return getBanner();
  if (action === "getEvents") return getEvents();
  if (action === "getLaporanPentadbir") return getLaporanPentadbir();
  if (action === "getDataMurid") return getDataMurid();
  if (action === "getKeberadaanMurid") return getKeberadaanMurid();
  if (action === "getJadualGuru") return getJadualGuru();
  return jsonResponse({ error: "Unknown action: " + action });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: "Data tidak sah." });
  }
  if (body.action === "addPengumuman") return addPengumuman(body);
  if (body.action === "addEvent") return addEvent(body);
  if (body.action === "addLaporanPentadbir") return addLaporanPentadbir(body);
  if (body.action === "deleteLaporanPentadbir") return deleteLaporanPentadbir(body);
  if (body.action === "uploadDataMurid") return uploadDataMurid(body);
  if (body.action === "addKeberadaanMurid") return addKeberadaanMurid(body);
  if (body.action === "editKeberadaanCatatan") return editKeberadaanCatatan(body);
  if (body.action === "uploadJadualGuru") return uploadJadualGuru(body);
  if (body.action === "addTodoItem") return addTodoItem(body);
  if (body.action === "editTodoItem") return editTodoItem(body);
  if (body.action === "deleteTodoItem") return deleteTodoItem(body);
  return jsonResponse({ success: false, message: "Unknown action: " + body.action });
}

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Paksa zon waktu Spreadsheet ke Malaysia (GMT+8) setiap kali tulis, supaya
 * new Date() ditafsir/dipaparkan betul walaupun tetapan Spreadsheet tersilap.
 */
function ensureTimezone() {
  try {
    SpreadsheetApp.openById(SPREADSHEET_ID).setSpreadsheetTimeZone("Asia/Kuala_Lumpur");
  } catch (err) { /* abaikan kalau gagal — appendRow tetap teruskan */ }
}

/* ---------------- USER / LOGIN ---------------- */

function findUserByEmail(email) {
  if (!email) return null;
  var sheet = getSheet("DatabaseSTAFF");
  var data = sheet.getDataRange().getValues();
  var target = String(email).trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var emel1 = String(row[COL_EMEL1] || "").trim().toLowerCase();
    var emel2 = String(row[COL_EMEL2] || "").trim().toLowerCase();
    if (emel1 === target || emel2 === target) {
      return {
        nama: row[COL_NAMA],
        jawatan: row[COL_JAWATAN],
        telefon: row[COL_TELEFON],
        gambar: row[COL_GAMBAR],
        role: row[COL_ROLE] || "",
        role2: row[COL_ROLE2] || "",
        emel1: row[COL_EMEL1],
        emel2: row[COL_EMEL2],
      };
    }
  }
  return null;
}

function getUser(email) {
  var user = findUserByEmail(email);
  if (!user) return jsonResponse({ found: false });
  return jsonResponse({
    found: true,
    nama: user.nama,
    jawatan: user.jawatan,
    gambar: user.gambar,
    role: user.role,
    role2: user.role2,
    telefon: user.telefon,
    emel1: user.emel1,
    emel2: user.emel2,
  });
}

/* ---------------- PENGUMUMAN ---------------- */

function getPengumuman() {
  var sheet = getSheet("Pengumuman");
  var data = sheet.getDataRange().getValues();
  var list = [];
  var todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
  // Lajur: A = link gambar (pilihan), B = teks pengumuman, C = tarikh tamat (pilihan)
  for (var i = 1; i < data.length; i++) {
    var gambar = data[i][0];
    var teks = data[i][1];
    var tarikhTamatRaw = data[i][2];
    if (!gambar && !teks) continue;

    var tarikhTamatKey = "";
    if (tarikhTamatRaw) {
      tarikhTamatKey = Utilities.formatDate(new Date(tarikhTamatRaw), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
      if (tarikhTamatKey < todayKey) continue; // dah tamat — langkau
    }

    list.push({ gambar: gambar || "", teks: teks, tarikhTamat: tarikhTamatKey });
  }
  list.reverse(); // pengumuman terbaru dahulu
  return jsonResponse(list);
}

/* ---------------- BANNER (slaid muka depan) ---------------- */

function getBanner() {
  try {
    var sheet = getSheet("Banner");
    if (!sheet) return jsonResponse([]);
    var data = sheet.getDataRange().getValues();
    var list = [];
    // Lajur A = link gambar (saiz disyorkan 1500w x 500h)
    for (var i = 1; i < data.length; i++) {
      var link = data[i][0];
      if (link) list.push(String(link).trim());
    }
    return jsonResponse(list);
  } catch (err) {
    return jsonResponse([]);
  }
}

// Folder Drive khas untuk gambar Hebahan
var PENGUMUMAN_DRIVE_FOLDER_ID = "1_QMB1OajrN1F9aylGCY20rWX70iMUq6i";

function pengumumanSaveImageToDrive(base64DataUrl, filenamePrefix) {
  if (!base64DataUrl || base64DataUrl.indexOf("base64,") === -1) return "";
  var parts = base64DataUrl.split("base64,");
  var meta = parts[0];
  var mimeMatch = meta.match(/data:(image\/[a-zA-Z0-9.+-]+);/);
  var mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  var bytes = Utilities.base64Decode(parts[1]);
  var blob = Utilities.newBlob(bytes, mimeType, filenamePrefix + "." + (mimeType.split("/")[1] || "jpg"));
  var file = DriveApp.getFolderById(PENGUMUMAN_DRIVE_FOLDER_ID).createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) { /* fail dah wujud dalam folder — teruskan walau setSharing gagal */ }
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

function addPengumuman(body) {
  var user = findUserByEmail(body.email);
  if (!user || user.role !== "Admin") {
    return jsonResponse({ success: false, message: "Hanya Admin boleh tambah pengumuman." });
  }
  var teks = body.teks ? String(body.teks).trim() : "";
  var hasImage = body.gambarBase64 && body.gambarBase64.indexOf("base64,") !== -1;
  if (!teks && !hasImage) {
    return jsonResponse({ success: false, message: "Sila isi teks ATAU muat naik gambar (sekurang-kurangnya satu)." });
  }
  if (!body.tarikhTamat) {
    return jsonResponse({ success: false, message: "Sila tetapkan tarikh tamat hebahan." });
  }
  ensureTimezone();

  var gambarUrl = "";
  if (hasImage) {
    try {
      gambarUrl = pengumumanSaveImageToDrive(body.gambarBase64, "hebahan_" + new Date().getTime());
    } catch (imgErr) {
      return jsonResponse({ success: false, message: "Gagal muat naik gambar ke Drive (" + imgErr.message + ")." });
    }
  }

  var sheet = getSheet("Pengumuman");
  sheet.appendRow([gambarUrl, teks, new Date(body.tarikhTamat)]);
  return jsonResponse({ success: true });
}

/* ---------------- EVENT (kalendar) ---------------- */
// Lajur tab "Event" (baris 1 = header, data bermula baris 2):
// A=Unit, B=TarikhDari, C=TarikhHingga, D=Masa, E=Tajuk, F=Tempat, G=DicatatOleh

function fmtDateISO(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
}

function getEvents() {
  try {
    var sheet = getSheet("Event");
    if (!sheet) return jsonResponse([]);
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[1] || !row[4]) continue; // perlu sekurang-kurangnya tarikh dari + tajuk
      list.push({
        unit: row[0] || "",
        tarikhDari: fmtDateISO(row[1]),
        tarikhHingga: row[2] ? fmtDateISO(row[2]) : fmtDateISO(row[1]),
        masa: row[3] || "",
        tajuk: row[4] || "",
        tempat: row[5] || "",
        dicatatOleh: row[6] || "",
      });
    }
    return jsonResponse(list);
  } catch (err) {
    return jsonResponse([]);
  }
}

function addEvent(body) {
  var user = findUserByEmail(body.email);
  if (!user) {
    return jsonResponse({ success: false, message: "Emel tidak berdaftar dalam sistem." });
  }
  if (!body.unit || !body.tarikhDari || !body.tajuk) {
    return jsonResponse({ success: false, message: "Sila lengkapkan unit, tarikh dan tajuk." });
  }
  ensureTimezone();
  var sheet = getSheet("Event");
  sheet.appendRow([
    body.unit,
    new Date(body.tarikhDari),
    body.tarikhHingga ? new Date(body.tarikhHingga) : new Date(body.tarikhDari),
    body.masa || "",
    body.tajuk,
    body.tempat || "",
    user.nama || body.email,
  ]);
  return jsonResponse({ success: true });
}

/* ---------------- LAPORAN PENTADBIR BERTUGAS ---------------- */
// Tab "LaporanPentadbirBertugas" (baris 1 = header, data bermula baris 2):
// A=Tarikh, B=Masa, C=BlokKelas, D=Catatan, E=Gambar1, F=Gambar2, G=NamaPentadbir, H=DicatatOleh(emel)

// GANTI dengan ID folder Google Drive kalau nak gambar disimpan ke folder khas
// (buka folder tu di Drive, salin ID dari URL selepas /folders/ ).
// Biarkan kosong ("") untuk simpan terus ke root Drive akaun pemilik Apps Script.
var LAPORAN_DRIVE_FOLDER_ID = "";

function lpFmtDateISO(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
}

function lpFmtMasa(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+8", "h:mm a");
  }
  var str = String(val || "").trim();
  var m = str.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    var h = parseInt(m[1], 10);
    var min = m[2];
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + min + " " + suffix;
  }
  return str;
}

function getLaporanPentadbir() {
  try {
    var sheet = getSheet("LaporanPentadbirBertugas");
    if (!sheet) return jsonResponse([]);
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0] || !row[2]) continue; // perlu tarikh + blok/kelas
      list.push({
        rowNum: i + 1,
        tarikh: lpFmtDateISO(row[0]),
        masa: lpFmtMasa(row[1]),
        blokKelas: row[2] || "",
        catatan: row[3] || "",
        gambar1: row[4] || "",
        gambar2: row[5] || "",
        namaPentadbir: row[6] || "",
      });
    }
    return jsonResponse(list);
  } catch (err) {
    return jsonResponse([]);
  }
}

function lpSaveImageToDrive(base64DataUrl, filenamePrefix) {
  if (!base64DataUrl || base64DataUrl.indexOf("base64,") === -1) return "";
  var parts = base64DataUrl.split("base64,");
  var meta = parts[0]; // contoh: "data:image/jpeg;"
  var mimeMatch = meta.match(/data:(image\/[a-zA-Z0-9.+-]+);/);
  var mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  var bytes = Utilities.base64Decode(parts[1]);
  var blob = Utilities.newBlob(bytes, mimeType, filenamePrefix + "." + (mimeType.split("/")[1] || "jpg"));
  var file;
  if (LAPORAN_DRIVE_FOLDER_ID) {
    file = DriveApp.getFolderById(LAPORAN_DRIVE_FOLDER_ID).createFile(blob);
  } else {
    file = DriveApp.createFile(blob);
  }
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    // fail dah wujud dalam folder — teruskan walau setSharing gagal (contoh: dasar Shared Drive)
  }
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

/**
 * JALANKAN FUNGSI NI SEKALI SAHAJA dalam editor Apps Script (bukan sebagai Web App)
 * — pilih "authorizeDriveAccess" di dropdown atas, klik Run.
 * Ini akan minta kebenaran (authorize) akses Google Drive. Tanpa langkah ni,
 * muat naik gambar dari borang akan gagal senyap (row tersimpan tapi gambar kosong).
 */
function authorizeDriveAccess() {
  var testFile = DriveApp.createFile("test-akses-laporan-pentadbir.txt", "Fail ujian — boleh dipadam.", MimeType.PLAIN_TEXT);
  Logger.log("Berjaya! Akses Drive sudah dibenarkan. Fail ujian: " + testFile.getUrl());
  Logger.log("Awak boleh padam fail 'test-akses-laporan-pentadbir.txt' ni dari Google Drive sekarang.");
}

function addLaporanPentadbir(body) {
  var user = findUserByEmail(body.email);
  if (!body.tarikh || !body.blokKelas || !body.namaPentadbir) {
    return jsonResponse({ success: false, message: "Sila lengkapkan nama pentadbir, tarikh, dan blok/kelas." });
  }
  ensureTimezone();
  var sheet = getSheet("LaporanPentadbirBertugas");
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Tab "LaporanPentadbirBertugas" tidak dijumpai dalam Sheet.' });
  }

  var stamp = new Date().getTime();
  var gambar1Url = "", gambar2Url = "";
  var imgWarnings = [];
  try {
    gambar1Url = lpSaveImageToDrive(body.gambar1, "pemantauan_" + stamp + "_1");
  } catch (imgErr1) {
    imgWarnings.push("Gambar 1: " + imgErr1.message);
  }
  try {
    gambar2Url = lpSaveImageToDrive(body.gambar2, "pemantauan_" + stamp + "_2");
  } catch (imgErr2) {
    imgWarnings.push("Gambar 2: " + imgErr2.message);
  }

  sheet.appendRow([
    new Date(body.tarikh),
    body.masa || "",
    body.blokKelas,
    body.catatan || "",
    gambar1Url,
    gambar2Url,
    body.namaPentadbir,
    (user && user.email) || body.email || "",
  ]);
  // Paksa lajur Masa (B) jadi format teks supaya Sheets tak auto-tukar jadi objek Date/Time
  var newRow = sheet.getLastRow();
  sheet.getRange(newRow, 2).setNumberFormat("@").setValue(body.masa || "");
  return jsonResponse({ success: true, warning: imgWarnings.length ? imgWarnings.join(" | ") : null });
}

/**
 * Padam SEMUA baris yang sepadan dengan namaPentadbir + tarikh (satu laporan hari tu).
 */
function deleteLaporanPentadbir(body) {
  if (!body.namaPentadbir || !body.tarikh) {
    return jsonResponse({ success: false, message: "Maklumat tidak lengkap untuk padam." });
  }
  var sheet = getSheet("LaporanPentadbirBertugas");
  if (!sheet) return jsonResponse({ success: false, message: "Tab tidak dijumpai." });

  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var rowTarikh = lpFmtDateISO(row[0]);
    var rowNama = String(row[6] || "").trim();
    if (rowTarikh === body.tarikh && rowNama === String(body.namaPentadbir).trim()) {
      rowsToDelete.push(i + 1);
    }
  }
  // padam dari bawah ke atas supaya nombor baris tak beralih semasa proses
  rowsToDelete.sort(function (a, b) { return b - a; });
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }
  return jsonResponse({ success: true, deleted: rowsToDelete.length });
}

/* ---------------- DATA MURID ---------------- */
// Tab "DatabaseMurid" (baris 1 = header, data bermula baris 2):
// A=Nama, B=NoKP, C=Kelas, D=Jantina(L/P), E=Asrama, F=Catatan

/**
 * SEMUA lajur data murid — 61 lajur ikut eksport KPM/APDM + 3 lajur terbitan
 * (Kelas Gabungan/Asrama Kod/Catatan). MESTI sepadan tepat dengan
 * DM_CANONICAL_FIELDS dalam data-murid.js (kunci & susunan sama).
 */
var DM_CANONICAL_FIELDS = [
  { key: "idMurid", header: "ID MURID" }, { key: "nama", header: "NAMA" },
  { key: "noPengenalan", header: "NO. PENGENALAN" }, { key: "jenisPengenalan", header: "JENIS PENGENALAN" },
  { key: "tarikhLahir", header: "TARIKH LAHIR" }, { key: "statusPengajian", header: "STATUS PENGAJIAN" },
  { key: "tarikhMasukSekolah", header: "TARIKH MASUK SEKOLAH" }, { key: "tarikhMasukKelas", header: "TARIKH MASUK KELAS" },
  { key: "tahunTingkatan", header: "TAHUN / TINGKATAN" }, { key: "namaKelas", header: "NAMA KELAS" },
  { key: "statusDlp", header: "STATUS DLP" }, { key: "jenisKelas", header: "JENIS KELAS" },
  { key: "keteranganAliran", header: "KETERANGAN ALIRAN" }, { key: "keteranganBidang", header: "KETERANGAN BIDANG" },
  { key: "namaGuruKelas", header: "NAMA GURU KELAS" }, { key: "jantina", header: "JANTINA" },
  { key: "kaum", header: "KAUM" }, { key: "agama", header: "AGAMA" },
  { key: "warganegara", header: "WARGANEGARA" }, { key: "negaraAsal", header: "NEGARA ASAL" },
  { key: "statusAsrama", header: "STATUS ASRAMA" }, { key: "namaAsrama", header: "NAMA ASRAMA" },
  { key: "statusOku", header: "STATUS OKU" }, { key: "tarikhSahOku", header: "TARIKH SAH OKU" },
  { key: "noPendaftaranOku", header: "NO. PENDAFTARAN OKU" }, { key: "tarikhDaftarOku", header: "TARIKH DAFTAR OKU" },
  { key: "tarikhKadOku", header: "TARIKH KAD OKU" }, { key: "kategoriKetidakupayaan", header: "KATEGORI KETIDAKUPAYAAN" },
  { key: "subkategoriKetidakupayaan", header: "SUBKATEGORI KETIDAKUPAYAAN" }, { key: "statusYatim", header: "STATUS YATIM" },
  { key: "noAkaunBank", header: "NO. AKAUN BANK" }, { key: "namaBank", header: "NAMA BANK" },
  { key: "penjaga1", header: "PENJAGA 1" }, { key: "noPengenalanPenjaga1", header: "NO. PENGENALAN PENJAGA 1" },
  { key: "jnsPengenalanPenjaga1", header: "JNS. PENGENALAN PENJAGA 1" }, { key: "hubunganPenjaga1", header: "HUBUNGAN PENJAGA 1" },
  { key: "pekerjaanPenjaga1", header: "PEKERJAAN PENJAGA 1" }, { key: "statusKerjaPenjaga1", header: "STATUS KERJA PENJAGA 1" },
  { key: "namaMajikanPenjaga1", header: "NAMA MAJIKAN PENJAGA 1" }, { key: "pendapatanPenjaga1", header: "PENDAPATAN PENJAGA 1" },
  { key: "noTelPejabatPenjaga1", header: "NO. TEL. PEJABAT PENJAGA 1" }, { key: "noTelBimbitPenjaga1", header: "NO. TEL. BIMBIT PENJAGA 1" },
  { key: "tanggungan", header: "TANGGUNGAN" }, { key: "penjaga2", header: "PENJAGA 2" },
  { key: "noPengenalanPenjaga2", header: "NO. PENGENALAN PENJAGA 2" }, { key: "jnsPengenalanPenjaga2", header: "JNS. PENGENALAN PENJAGA 2" },
  { key: "hubunganPenjaga2", header: "HUBUNGAN PENJAGA 2" }, { key: "pekerjaanPenjaga2", header: "PEKERJAAN PENJAGA 2" },
  { key: "statusKerjaPenjaga2", header: "STATUS KERJA PENJAGA 2" }, { key: "namaMajikanPenjaga2", header: "NAMA MAJIKAN PENJAGA 2" },
  { key: "pendapatanPenjaga2", header: "PENDAPATAN PENJAGA 2" }, { key: "noTelPejabatPenjaga2", header: "NO. TEL. PEJABAT PENJAGA 2" },
  { key: "noTelBimbitPenjaga2", header: "NO. TEL. BIMBIT PENJAGA 2" }, { key: "alamat1", header: "ALAMAT 1" },
  { key: "alamat2", header: "ALAMAT 2" }, { key: "alamat3", header: "ALAMAT 3" },
  { key: "poskod", header: "POSKOD" }, { key: "bandar", header: "BANDAR" },
  { key: "daerah", header: "DAERAH" }, { key: "negeri", header: "NEGERI" },
  { key: "kelas", header: "Kelas" }, { key: "asramaKod", header: "Asrama" },
  { key: "catatan", header: "Catatan" },
];

function dmNormHeader_(h) {
  return String(h || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function getDataMurid() {
  var sheet = getSheet("DatabaseMurid");
  if (!sheet) return jsonResponse([]);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse([]);

  // Padankan header sebenar dalam Sheet dengan DM_CANONICAL_FIELDS ikut NAMA
  // (fleksibel — abaikan besar/kecil huruf & tanda baca, bukan kedudukan tetap)
  var headerRow = data[0].map(dmNormHeader_);
  var colIdxByKey = {};
  DM_CANONICAL_FIELDS.forEach(function (f) {
    var idx = headerRow.indexOf(dmNormHeader_(f.header));
    if (idx !== -1) colIdxByKey[f.key] = idx;
  });

  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rec = {};
    DM_CANONICAL_FIELDS.forEach(function (f) {
      if (colIdxByKey[f.key] !== undefined) {
        var v = row[colIdxByKey[f.key]];
        rec[f.key] = v == null ? "" : String(v);
      }
    });
    if (!rec.nama || !rec.kelas) continue;
    list.push(rec);
  }
  return jsonResponse(list);
}

/**
 * body: { email, murid: [{...sebarang subset kunci DM_CANONICAL_FIELDS}, ...] }
 * Upsert ikut No. Pengenalan (kunci unik) — kalau dah wujud, KEMASKINI baris;
 * kalau tiada, TAMBAH baris baharu. Dihadkan kepada jawatan
 * "PPP (GURU DATA MURID)" atau Role "Admin". Sheet auto-cipta dengan SEMUA
 * 64 lajur kanonikal kalau belum wujud.
 */
function uploadDataMurid(body) {
  var user = findUserByEmail(body.email);
  var jawatanUpper = user ? String(user.jawatan || "").trim().toUpperCase() : "";
  var isDataMuridGuru = jawatanUpper === "PPP (GURU DATA MURID)";
  var isAdmin = user && String(user.role || "").trim().toLowerCase() === "admin";
  if (!user || (!isDataMuridGuru && !isAdmin)) {
    return jsonResponse({ success: false, message: "Hanya Guru Data Murid atau Admin boleh muat naik data murid." });
  }
  if (!body.murid || !body.murid.length) {
    return jsonResponse({ success: false, message: "Tiada rekod murid dihantar." });
  }

  ensureTimezone();
  var sheet = getSheet("DatabaseMurid");
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("DatabaseMurid");
    sheet.appendRow(DM_CANONICAL_FIELDS.map(function (f) { return f.header; }));
  }

  var noPengenalanColIdx = DM_CANONICAL_FIELDS.findIndex(function (f) { return f.key === "noPengenalan"; });
  var data = sheet.getDataRange().getValues();
  var kpToRow = {}; // No. Pengenalan -> nombor baris sebenar dalam Sheet
  for (var i = 1; i < data.length; i++) {
    var kp = String(data[i][noPengenalanColIdx] || "").trim();
    if (kp) kpToRow[kp] = i + 1;
  }

  var added = 0, updated = 0, skipped = 0;
  body.murid.forEach(function (m) {
    var nama = String(m.nama || "").trim();
    var kelas = String(m.kelas || "").trim();
    if (!nama || !kelas) { skipped++; return; }

    var rowValues = DM_CANONICAL_FIELDS.map(function (f) { return m[f.key] || ""; });
    var noPengenalan = String(m.noPengenalan || "").trim();

    if (noPengenalan && kpToRow[noPengenalan]) {
      sheet.getRange(kpToRow[noPengenalan], 1, 1, rowValues.length).setValues([rowValues]);
      updated++;
    } else {
      sheet.appendRow(rowValues);
      if (noPengenalan) kpToRow[noPengenalan] = sheet.getLastRow();
      added++;
    }
  });

  // Paksa lajur No. Pengenalan jadi teks supaya nombor panjang tak jadi notasi saintifik
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, noPengenalanColIdx + 1, lastRow - 1, 1).setNumberFormat("@");

  return jsonResponse({ success: true, added: added, updated: updated, skipped: skipped });
}

/* ---------------- KEBERADAAN MURID ---------------- */
// Tab "KeberadaanMurid" (baris 1 = header, data bermula baris 2):
// A=ID, B=TimeStamp, C=Tarikh, D=Kategori, E=Tingkatan, F=NamaMurid, G=Tempat, H=Catatan, I=DicatatOleh

function kbGenId() {
  return Utilities.getUuid().slice(0, 8);
}
function kbFmtDateISO(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
}

function getKeberadaanMurid() {
  var sheet = getSheet("KeberadaanMurid");
  if (!sheet) return jsonResponse([]);
  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[2] || !row[5]) continue; // perlu tarikh + nama murid
    list.push({
      rowId: i + 1,
      tarikh: row[2] instanceof Date ? kbFmtDateISO(row[2]) : row[2],
      kategori: row[3] || "",
      tingkatan: row[4] || "",
      nama: row[5] || "",
      tempat: row[6] || "",
      catatan: row[7] || "",
      dicatatOleh: row[8] || "",
    });
  }
  return jsonResponse(list);
}

/**
 * body: { email, kategori, tarikh, tempat, murid: [{tingkatan, nama}, ...] }
 * Satu BARIS per murid (walaupun dihantar sekali sebagai kumpulan Program).
 */
function addKeberadaanMurid(body) {
  var user = findUserByEmail(body.email);
  if (!body.kategori || !body.tarikh || !body.murid || !body.murid.length) {
    return jsonResponse({ success: false, message: "Sila lengkapkan kategori, tarikh, dan sekurang-kurangnya seorang murid." });
  }
  ensureTimezone();
  var sheet = getSheet("KeberadaanMurid");
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("KeberadaanMurid");
    sheet.appendRow(["ID", "TimeStamp", "Tarikh", "Kategori", "Tingkatan", "NamaMurid", "Tempat", "Catatan", "DicatatOleh"]);
  }

  var dicatatOleh = (user && user.nama) || body.email || "";
  var tarikhDate = new Date(body.tarikh);
  body.murid.forEach(function (m) {
    if (!m.nama) return;
    sheet.appendRow([
      kbGenId(), new Date(), tarikhDate, body.kategori, m.tingkatan || "", m.nama, body.tempat || "", "", dicatatOleh,
    ]);
  });

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 3, lastRow - 1, 1).setNumberFormat("dd/mm/yyyy");

  return jsonResponse({ success: true, count: body.murid.length });
}

/**
 * body: { rowId, catatan } — kemaskini medan Catatan sahaja pada baris sedia ada.
 */
function editKeberadaanCatatan(body) {
  var rowId = parseInt(body.rowId, 10);
  if (!rowId) return jsonResponse({ success: false, message: "rowId diperlukan." });
  var sheet = getSheet("KeberadaanMurid");
  if (!sheet || rowId < 2 || rowId > sheet.getLastRow()) {
    return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
  }
  sheet.getRange(rowId, 8).setValue(body.catatan || "");
  return jsonResponse({ success: true });
}

/* ---------------- JADUAL GURU ---------------- */
// Tab "JadualGuru" (baris 1 = header, data bermula baris 2):
// A=Hari, B=NamaGuru, C=Slot, D=WaktuMula, E=WaktuTamat, F=Subjek, G=Kelas

function getJadualGuru() {
  var sheet = getSheet("JadualGuru");
  var meta = PropertiesService.getScriptProperties().getProperty("jadualGuruLastUpdate") || "";
  if (!sheet) return jsonResponse({ data: [], lastUpdate: meta });
  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1] || !row[0]) continue; // perlu nama guru + hari
    list.push({
      hari: row[0], guru: row[1], kodGuru: row[2] || "", slot: row[3], waktuMula: row[4], waktuTamat: row[5],
      subjek: row[6] || "", kelas: row[7] || "",
    });
  }
  return jsonResponse({ data: list, lastUpdate: meta });
}

/**
 * body: { email, rows: [{hari,guru,slot,waktuMula,waktuTamat,subjek,kelas}, ...] }
 * GANTI SEPENUHNYA data jadual sedia ada (padam semua, tulis baharu) — sebab
 * jadual induk baharu sepatutnya menggantikan versi lama, bukan gabung.
 * Dihadkan kepada jawatan "PPP (GURU JADUAL WAKTU)" atau Role "Admin".
 */
function uploadJadualGuru(body) {
  var user = findUserByEmail(body.email);
  var jawatanUpper = user ? String(user.jawatan || "").trim().toUpperCase() : "";
  var isJadualGuru = jawatanUpper === "PPP (GURU JADUAL WAKTU)";
  var isAdmin = user && String(user.role || "").trim().toLowerCase() === "admin";
  if (!user || (!isJadualGuru && !isAdmin)) {
    return jsonResponse({ success: false, message: "Hanya Guru Jadual Waktu atau Admin boleh kemaskini jadual guru." });
  }
  if (!body.rows || !body.rows.length) {
    return jsonResponse({ success: false, message: "Tiada data jadual dihantar." });
  }

  ensureTimezone();
  var sheet = getSheet("JadualGuru");
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("JadualGuru");
  } else {
    sheet.clear();
  }
  sheet.appendRow(["Hari", "NamaGuru", "KodGuru", "Slot", "WaktuMula", "WaktuTamat", "Subjek", "Kelas"]);

  var values = body.rows.map(function (r) {
    return [r.hari || "", r.guru || "", r.kodGuru || "", r.slot || "", r.waktuMula || "", r.waktuTamat || "", r.subjek || "", r.kelas || ""];
  });
  if (values.length) {
    sheet.getRange(2, 1, values.length, 8).setValues(values);
  }

  var now = kbFmtDateISO(new Date()) + " " + Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "HH:mm");
  PropertiesService.getScriptProperties().setProperty("jadualGuruLastUpdate", now);

  return jsonResponse({ success: true, count: values.length, lastUpdate: now });
}

/* ---------------- TO DO LIST (staf sokongan tanpa jadual waktu mengajar) ---------------- */
// Tab "To Do List" (baris 1 = header, data bermula baris 2):
// A=ID, B=Nama, C=TarikhMula, D=TarikhAkhir, E=Perkara

function todoGenId() {
  return Utilities.getUuid().slice(0, 8);
}

function addTodoItem(body) {
  var user = findUserByEmail(body.email);
  var nama = (user && user.nama) || body.email || "";
  if (!body.tarikhMula || !body.tarikhAkhir || !body.perkara) {
    return jsonResponse({ success: false, message: "Sila lengkapkan tarikh mula, tarikh akhir, dan perkara." });
  }
  ensureTimezone();
  var sheet = getSheet("To Do List");
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("To Do List");
    sheet.appendRow(["ID", "Nama", "TarikhMula", "TarikhAkhir", "Perkara"]);
  }
  var id = todoGenId();
  sheet.appendRow([id, nama, new Date(body.tarikhMula), new Date(body.tarikhAkhir), body.perkara]);
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 3, 1, 2).setNumberFormat("yyyy-mm-dd");
  return jsonResponse({ success: true, id: id });
}

function editTodoItem(body) {
  if (!body.id) return jsonResponse({ success: false, message: "id diperlukan." });
  var sheet = getSheet("To Do List");
  if (!sheet) return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      if (body.tarikhMula) sheet.getRange(i + 1, 3).setValue(new Date(body.tarikhMula));
      if (body.tarikhAkhir) sheet.getRange(i + 1, 4).setValue(new Date(body.tarikhAkhir));
      if (body.perkara) sheet.getRange(i + 1, 5).setValue(body.perkara);
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
}

function deleteTodoItem(body) {
  if (!body.id) return jsonResponse({ success: false, message: "id diperlukan." });
  var sheet = getSheet("To Do List");
  if (!sheet) return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
}
