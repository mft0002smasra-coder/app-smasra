/**
 * KEHADIRAN MURID — Backend Web App (BERASINGAN daripada bot Telegram)
 * -----------------------------------------------------------------
 * PENTING: Ini PROJEK APPS SCRIPT BAHARU, bukan tambah kod dalam projek
 * bot Telegram sedia ada. Ini sengaja dibuat berasingan supaya:
 *   - Tak sentuh/risiko rosakkan bot Telegram yang sedang berfungsi
 *   - doGet/doPost projek ni tak berlanggar dengan doGet/doPost bot
 *
 * Cara pasang:
 * 1. Buka Google Sheet "Kehadiran_Murid_SMASRA" (ID: 1ZjUjYPY5QBxOrOIDI6PixpS5ygdatAsZ4HT_uT-iMMA)
 * 2. Extensions > Apps Script (ini akan buka/cipta projek Apps Script BAHARU
 *    kalau sheet ni belum ada projek bound — kalau dah ada projek bot,
 *    buat projek BERASINGAN: script.google.com > New project > tampal kod ni,
 *    lepas tu dalam kod, SPREADSHEET_ID dah ditetapkan terus jadi tak perlu bound ke sheet)
 * 3. Padam kod default, tampal SEMUA kod ni
 * 4. Deploy > New deployment > ikon gear > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Salin URL (.../exec), paste ke KM_API_URL dalam kehadiran-murid-borang.js
 */

var SHEET_ID = "1ZjUjYPY5QBxOrOIDI6PixpS5ygdatAsZ4HT_uT-iMMA";

function doGet(e) {
  var action = e.parameter.action;
  if (action === "ping") return jsonOut({ ok: true });
  return jsonOut({ error: "Unknown action: " + action });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ success: false, message: "Data tidak sah." });
  }
  if (body.action === "saveKehadiran") return saveKehadiran(body);
  return jsonOut({ success: false, message: "Unknown action: " + body.action });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ensureTimezone() {
  try {
    SpreadsheetApp.openById(SHEET_ID).setSpreadsheetTimeZone("Asia/Kuala_Lumpur");
  } catch (err) { /* abaikan kalau gagal */ }
}

/**
 * body: { kelas, tarikh ("dd/mm/yyyy"), hadir, tidakHadir, namaTidakHadir, direkodOleh }
 * Cari baris sedia ada (tarikh+kelas sama) -> overwrite; kalau tiada -> baris baru.
 */
function saveKehadiran(body) {
  if (!body.kelas || !body.tarikh) {
    return jsonOut({ success: false, message: "Kelas dan tarikh diperlukan." });
  }
  ensureTimezone();

  var parts = String(body.tarikh).split("/");
  if (parts.length !== 3) {
    return jsonOut({ success: false, message: "Format tarikh tidak sah." });
  }
  var tarikhDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));

  var hadir = Number(body.hadir) || 0;
  var tidakHadir = Number(body.tidakHadir) || 0;
  var jumlah = hadir + tidakHadir;
  var peratus = jumlah > 0 ? Math.round((hadir / jumlah) * 100) : 0;

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Kehadiran");
  if (!sheet) {
    return jsonOut({ success: false, message: 'Tab "Kehadiran" tidak dijumpai dalam Sheet.' });
  }
  var data = sheet.getDataRange().getValues();

  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][0];
    var rowKelas = data[i][1];
    if (!(rowDate instanceof Date) || !rowKelas) continue;
    var sameDate =
      rowDate.getFullYear() === tarikhDate.getFullYear() &&
      rowDate.getMonth() === tarikhDate.getMonth() &&
      rowDate.getDate() === tarikhDate.getDate();
    if (sameDate && String(rowKelas).trim() === String(body.kelas).trim()) {
      rowIndex = i + 1; // baris sebenar dalam Sheet (1-indexed)
      break;
    }
  }

  var rowValues = [
    tarikhDate,
    body.kelas,
    hadir,
    tidakHadir,
    body.namaTidakHadir || "",
    jumlah,
    peratus,
    body.direkodOleh || "",
  ];

  var overwritten = rowIndex > 0;
  if (overwritten) {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return jsonOut({ success: true, overwritten: overwritten, peratus: peratus });
}
