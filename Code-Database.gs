/**
 * DATABASE (eRKS) — Backend Web App BERASINGAN
 * -----------------------------------------------------------------
 * Bound ke Spreadsheet "Database" (ID: 1gCC26pdp5dqMwEYg6gzuGaiXhq6iA1M3gruLkkIzO5s)
 * — spreadsheet SAMA yang digunakan Analisis eRKS (baca sahaja, guna gviz).
 * Projek ni BERASINGAN daripada mana-mana bot/Apps Script sedia ada supaya
 * tak sentuh/risiko rosakkan sistem lain yang dah berfungsi di spreadsheet ni.
 *
 * Cara pasang:
 * 1. script.google.com > New project (JANGAN buka melalui bot sedia ada)
 * 2. Padam kod default, tampal SEMUA kod ni
 * 3. Deploy > New deployment > ikon gear > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Salin URL (.../exec), paste ke DB_API_URL dalam erks-database.js
 * 5. Jalankan fungsi "authorizeDbAccess" SEKALI dalam editor (Run) untuk
 *    sahkan akses Sheet sebelum guna borang.
 */

var DB_SHEET_ID = "1gCC26pdp5dqMwEYg6gzuGaiXhq6iA1M3gruLkkIzO5s";

// Lajur tab "Database": A=Gambar, B=No.KP, C=Nama, D=Jawatan, E=Telefon, F=Emel, G=Role
var DBCOL_GAMBAR = 0, DBCOL_NOKP = 1, DBCOL_NAMA = 2, DBCOL_JAWATAN = 3, DBCOL_TELEFON = 4, DBCOL_EMEL = 5, DBCOL_ROLE = 6;

function doGet(e) {
  var action = e.parameter.action;
  if (action === "getStaffByEmail") return getStaffByEmail(e.parameter.email);
  return dbJson({ error: "Unknown action: " + action });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return dbJson({ success: false, message: "Data tidak sah." });
  }
  if (body.action === "addKehadiran") return addKehadiran(body);
  if (body.action === "addKeberadaan") return addKeberadaan(body);
  return dbJson({ success: false, message: "Unknown action: " + body.action });
}

function dbJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function dbSheet(name) {
  return SpreadsheetApp.openById(DB_SHEET_ID).getSheetByName(name);
}
function dbGenId() {
  return Utilities.getUuid().slice(0, 8);
}

/**
 * JALANKAN SEKALI dalam editor Apps Script (bukan Web App) untuk sahkan
 * akses Sheet sebelum guna borang Kehadiran/Keberadaan.
 */
function authorizeDbAccess() {
  var sheet = dbSheet("Database");
  Logger.log("Berjaya! Akses Sheet Database disahkan. Baris data: " + sheet.getLastRow());
}

function getStaffByEmail(email) {
  if (!email) return dbJson({ found: false });
  var sheet = dbSheet("Database");
  if (!sheet) return dbJson({ found: false });
  var data = sheet.getDataRange().getValues();
  var target = String(email).trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var emel = String(row[DBCOL_EMEL] || "").trim().toLowerCase();
    if (emel === target) {
      return dbJson({
        found: true,
        noKP: row[DBCOL_NOKP],
        nama: row[DBCOL_NAMA],
        jawatan: row[DBCOL_JAWATAN],
      });
    }
  }
  return dbJson({ found: false });
}

/**
 * body: { email, noKP, nama, jawatan, tujuan("MASA MASUK"/"MASA KELUAR"), latLong }
 * Tab "Kehadiran": A=ID, B=TimeStamp, C=No.KP, D=Nama, E=Jawatan, F=Tujuan, G=LatLong
 */
function addKehadiran(body) {
  if (!body.noKP || !body.nama || !body.tujuan) {
    return dbJson({ success: false, message: "Maklumat staf/tujuan tidak lengkap." });
  }
  var sheet = dbSheet("Kehadiran");
  if (!sheet) return dbJson({ success: false, message: 'Tab "Kehadiran" tidak dijumpai.' });

  sheet.appendRow([
    dbGenId(),
    new Date(),
    body.noKP,
    body.nama,
    body.jawatan || "",
    body.tujuan,
    body.latLong || "0.000000, 0.000000",
  ]);
  return dbJson({ success: true });
}

/**
 * body: { email, noKP, nama, jawatan, tujuan, perkara, tempat, latLong,
 *         mula, tamat, masaMula, masaTamat }
 * Tab "Rekod": A=ID, B=TimeStamp, C=Gambar, D=No.KP, E=Nama, F=Jawatan,
 *              G=Tujuan, H=Perkara, I=Tempat, J=LatLong, K=Mula, L=Tamat,
 *              M=Masa Mula, N=Masa Tamat
 */
function dbFmtTarikh(isoDateStr) {
  var d = new Date(isoDateStr + "T00:00:00");
  return Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT+8", "dd-MMM-yy");
}
function dbFmtMasa(hhmm) {
  if (!hhmm) return "";
  var parts = String(hhmm).split(":");
  var h = parseInt(parts[0], 10);
  var m = parts[1] || "00";
  var suffix = h >= 12 ? "PM" : "AM";
  var h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return (h12 < 10 ? "0" + h12 : h12) + ":" + m + " " + suffix;
}

function addKeberadaan(body) {
  if (!body.noKP || !body.nama || !body.tujuan || !body.mula || !body.tamat) {
    return dbJson({ success: false, message: "Sila lengkapkan tujuan, tarikh mula, dan tarikh tamat." });
  }
  var sheet = dbSheet("Rekod");
  if (!sheet) return dbJson({ success: false, message: 'Tab "Rekod" tidak dijumpai.' });

  sheet.appendRow([
    dbGenId(),
    new Date(),
    "",
    body.noKP,
    body.nama,
    body.jawatan || "",
    body.tujuan,
    body.perkara || "",
    body.tempat || "",
    body.latLong || "0.000000, 0.000000",
    dbFmtTarikh(body.mula),
    dbFmtTarikh(body.tamat),
    dbFmtMasa(body.masaMula),
    dbFmtMasa(body.masaTamat),
  ]);
  return dbJson({ success: true });
}
