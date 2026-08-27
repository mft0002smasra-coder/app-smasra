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
  // Lajur: A = link gambar (pilihan), B = teks pengumuman
  for (var i = 1; i < data.length; i++) {
    var gambar = data[i][0];
    var teks = data[i][1];
    if (teks) {
      list.push({ gambar: gambar || "", teks: teks });
    }
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

function addPengumuman(body) {
  var user = findUserByEmail(body.email);
  if (!user || user.role !== "Admin") {
    return jsonResponse({ success: false, message: "Hanya Admin boleh tambah pengumuman." });
  }
  if (!body.teks || !String(body.teks).trim()) {
    return jsonResponse({ success: false, message: "Teks pengumuman tidak boleh kosong." });
  }
  var sheet = getSheet("Pengumuman");
  sheet.appendRow([body.gambar || "", body.teks]);
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

function lpFmtDateISO(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
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
        masa: row[1] || "",
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
  try {
    var parts = base64DataUrl.split("base64,");
    var meta = parts[0]; // contoh: "data:image/jpeg;"
    var mimeMatch = meta.match(/data:(image\/[a-zA-Z0-9.+-]+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    var bytes = Utilities.base64Decode(parts[1]);
    var blob = Utilities.newBlob(bytes, mimeType, filenamePrefix + "." + (mimeType.split("/")[1] || "jpg"));
    var file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (err) {
    return "";
  }
}

function addLaporanPentadbir(body) {
  var user = findUserByEmail(body.email);
  if (!body.tarikh || !body.blokKelas || !body.namaPentadbir) {
    return jsonResponse({ success: false, message: "Sila lengkapkan nama pentadbir, tarikh, dan blok/kelas." });
  }
  var sheet = getSheet("LaporanPentadbirBertugas");
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Tab "LaporanPentadbirBertugas" tidak dijumpai dalam Sheet.' });
  }

  var stamp = new Date().getTime();
  var gambar1Url = lpSaveImageToDrive(body.gambar1, "pemantauan_" + stamp + "_1");
  var gambar2Url = lpSaveImageToDrive(body.gambar2, "pemantauan_" + stamp + "_2");

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
  return jsonResponse({ success: true });
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
