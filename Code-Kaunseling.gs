/**
 * SISTEM TEMPAHAN SESI & PROGRAM KAUNSELING — SMA (JAIM) AL-ASYRAF
 * Backend Google Apps Script.
 *
 * Skrip ini bercakap dengan DUA Google Sheet berasingan:
 *   1) BOOKING_SHEET — tempat rekod sesi/program kaunseling disimpan (sheet "PSK")
 *   2) STAFF_SHEET   — senarai staf ("DatabaseSTAFF") untuk jana senarai kaunselor layak
 *
 * CARA PASANG:
 * 1. Buka mana-mana satu Google Sheet (cadangan: Sheet "Kaunseling")
 * 2. Extensions > Apps Script > padam kod default > tampal semua kod ini
 * 3. Deploy > New deployment > Type: Web app > Execute as: Me > Who has access: Anyone
 * 4. Salin URL yang dihasilkan ke KN_API_URL dalam tempahan-kaunseling.js
 */

var BOOKING_SHEET_ID = '17WFKbOCBOLzp7BRHy4DVDmqSI8H5RxkKH5opS1ZvOB0';
var BOOKING_SHEET_NAME = 'PSK';
var STAFF_SHEET_ID = '1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo';
var STAFF_SHEET_NAME = 'DatabaseSTAFF';

// Lajur BOOKING_SHEET ikut KEDUDUKAN TETAP:
// A=Tarikh MULA | B=Tarikh TAMAT (pilihan) | C=Waktu/Masa MULA | D=Waktu/Masa TAMAT |
// E=Program/Sesi Kaunseling | F=Perkara/Tajuk | G=Nama Murid | H=Tingkatan | I=Nama Kaunselor
var COL = { TARIKH_MULA:0, TARIKH_TAMAT:1, WAKTU_MULA:2, WAKTU_TAMAT:3, JENIS:4, PERKARA:5, MURID:6, TINGKATAN:7, KAUNSELOR:8 };
var HEADER_ROW = ['Tarikh MULA','Tarikh TAMAT (pilihan)','Waktu/ Masa MULA','Waktu/ Masa TAMAT','Program/ Sesi Kaunseling','Perkara/ Tajuk','Nama Murid','Tingkatan','Nama Kaunselor'];

// Lajur STAFF_SHEET (DatabaseSTAFF) ikut KEDUDUKAN TETAP (disahkan semasa
// bina modul Event/Laporan Pentadbir):
// A=Gambar | B=Nama | C=Jawatan | D=Telefon | E=Emel1 | F=Emel2 | G=Role | H=Role2
var SCOL = { NAMA:1, JAWATAN:2, ROLE1:6, ROLE2:7 };

function getBookingSheet_() {
  var ss = SpreadsheetApp.openById(BOOKING_SHEET_ID);
  var sheet = ss.getSheetByName(BOOKING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BOOKING_SHEET_NAME);
    sheet.appendRow(HEADER_ROW);
  }
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Paksa zon waktu Spreadsheet ke Malaysia (GMT+8) setiap kali tulis, supaya
 * new Date() ditafsir/dipaparkan betul walaupun tetapan Spreadsheet tersilap.
 */
function ensureTimezone_() {
  try {
    SpreadsheetApp.openById(BOOKING_SHEET_ID).setSpreadsheetTimeZone("Asia/Kuala_Lumpur");
  } catch (err) { /* abaikan kalau gagal — appendRow tetap teruskan */ }
}

function getTz_() {
  return SpreadsheetApp.openById(BOOKING_SHEET_ID).getSpreadsheetTimeZone();
}

function formatDate_(d) {
  return Utilities.formatDate(d, getTz_(), 'yyyy-MM-dd');
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  if (action === 'staff') return getStaffList_();
  return getBookings_();
}

function getBookings_() {
  var sheet = getBookingSheet_();
  var values = sheet.getDataRange().getValues();
  values.shift();
  var rows = values.map(function (row, idx) {
    return {
      rowId: idx + 2,
      TARIKH_MULA: row[COL.TARIKH_MULA] instanceof Date ? formatDate_(row[COL.TARIKH_MULA]) : row[COL.TARIKH_MULA],
      TARIKH_TAMAT: row[COL.TARIKH_TAMAT] instanceof Date ? formatDate_(row[COL.TARIKH_TAMAT]) : row[COL.TARIKH_TAMAT],
      WAKTU_MULA: row[COL.WAKTU_MULA],
      WAKTU_TAMAT: row[COL.WAKTU_TAMAT],
      JENIS: row[COL.JENIS],
      PERKARA: row[COL.PERKARA],
      MURID: row[COL.MURID],
      TINGKATAN: row[COL.TINGKATAN],
      KAUNSELOR: row[COL.KAUNSELOR]
    };
  }).filter(function (r) { return r.KAUNSELOR; });
  return jsonOut_({ status: 'success', data: rows });
}

// Senarai kaunselor layak: Jawatan mengandungi "KAUNSELOR SEPENUH MASA"
// ATAU Role (lajur G/H) ialah "Admin" atau "Pentadbir".
function getStaffList_() {
  var sheet = SpreadsheetApp.openById(STAFF_SHEET_ID).getSheetByName(STAFF_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  values.shift();
  var eligible = [];
  values.forEach(function (row) {
    var name = row[SCOL.NAMA];
    var jawatan = String(row[SCOL.JAWATAN] || '').toUpperCase();
    var role1 = String(row[SCOL.ROLE1] || '').trim().toUpperCase();
    var role2 = String(row[SCOL.ROLE2] || '').trim().toUpperCase();
    var isKaunselor = jawatan.indexOf('KAUNSELOR SEPENUH MASA') > -1;
    var isAdminRole = (role1 === 'ADMIN' || role1 === 'PENTADBIR' || role2 === 'ADMIN' || role2 === 'PENTADBIR');
    if (name && (isKaunselor || isAdminRole)) {
      eligible.push({ name: name, isKaunselor: isKaunselor, isAdmin: isAdminRole });
    }
  });
  return jsonOut_({ status: 'success', data: eligible });
}

function doPost(e) {
  var params;
  try {
    params = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ status: 'error', message: 'Data tidak sah.' });
  }
  if (params.action === 'edit') return editBooking_(params);
  return addBooking_(params);
}

function addBooking_(params) {
  ensureTimezone_();
  var sheet = getBookingSheet_();
  var values = sheet.getDataRange().getValues();
  values.shift();

  // Semakan pertindihan RINGKAS: kaunselor sama + tarikh mula sama + waktu mula sama.
  // (Ini bukan semakan pertindihan julat waktu penuh — cukup untuk elak dobel-entry jelas.)
  var conflict = false;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowTarikh = row[COL.TARIKH_MULA] instanceof Date ? formatDate_(row[COL.TARIKH_MULA]) : row[COL.TARIKH_MULA];
    if (row[COL.KAUNSELOR] === params.kaunselor && rowTarikh === params.tarikhMula && row[COL.WAKTU_MULA] === params.waktuMula) {
      conflict = true;
      break;
    }
  }
  if (conflict) {
    return jsonOut_({ status: 'conflict', message: 'Kaunselor ini sudah mempunyai rekod pada tarikh & waktu yang sama.' });
  }

  sheet.appendRow([
    params.tarikhMula,
    params.tarikhTamat || '',
    params.waktuMula,
    params.waktuTamat,
    params.jenis,
    params.perkara,
    params.murid,
    params.tingkatan,
    params.kaunselor
  ]);

  var newRow = sheet.getLastRow();
  sheet.getRange(newRow, COL.TARIKH_MULA + 1).setNumberFormat('@').setValue(params.tarikhMula);
  if (params.tarikhTamat) {
    sheet.getRange(newRow, COL.TARIKH_TAMAT + 1).setNumberFormat('@').setValue(params.tarikhTamat);
  }

  return jsonOut_({ status: 'success' });
}

/**
 * Kemaskini rekod SEDIA ADA (guna rowId) — untuk fungsi "klik kad, edit terus"
 * pada jadual. rowId datang dari medan `rowId` yang dipulangkan getBookings_().
 */
function editBooking_(params) {
  var rowId = parseInt(params.rowId, 10);
  if (!rowId) {
    return jsonOut_({ status: 'error', message: 'rowId diperlukan untuk kemaskini.' });
  }
  ensureTimezone_();
  var sheet = getBookingSheet_();
  if (rowId < 2 || rowId > sheet.getLastRow()) {
    return jsonOut_({ status: 'error', message: 'Rekod tidak dijumpai (mungkin dah dipadam/berubah).' });
  }

  sheet.getRange(rowId, COL.TARIKH_MULA + 1, 1, 9).setValues([[
    params.tarikhMula,
    params.tarikhTamat || '',
    params.waktuMula,
    params.waktuTamat,
    params.jenis,
    params.perkara,
    params.murid,
    params.tingkatan,
    params.kaunselor
  ]]);
  sheet.getRange(rowId, COL.TARIKH_MULA + 1).setNumberFormat('@').setValue(params.tarikhMula);
  if (params.tarikhTamat) {
    sheet.getRange(rowId, COL.TARIKH_TAMAT + 1).setNumberFormat('@').setValue(params.tarikhTamat);
  } else {
    sheet.getRange(rowId, COL.TARIKH_TAMAT + 1).setValue('');
  }

  return jsonOut_({ status: 'success' });
}
