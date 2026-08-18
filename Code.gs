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

function doGet(e) {
  var action = e.parameter.action;
  if (action === "getUser") return getUser(e.parameter.email);
  if (action === "getPengumuman") return getPengumuman();
  if (action === "getBanner") return getBanner();
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
