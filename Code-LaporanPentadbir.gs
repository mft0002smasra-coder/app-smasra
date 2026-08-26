/**
 * LAPORAN PENTADBIR BERTUGAS — Backend Web App (PROJEK BAHARU, BERASINGAN)
 * -------------------------------------------------------------------------
 * PENTING: Ini PROJEK APPS SCRIPT BAHARU, ikut corak modul Kehadiran Murid —
 * supaya tak sentuh/risiko rosakkan backend app utama atau bot Telegram.
 *
 * Cara pasang:
 * 1. Buka Google Sheet "List Laporan" (spreadsheet berasingan untuk modul ini)
 * 2. Pastikan ada tab bernama tepat: "List Laporan"
 *    Header baris 1 (pilihan sahaja, untuk rujukan admin — kod guna lajur ikut turutan):
 *    A:ID  B:Tarikh  C:Masa  D:NamaPentadbir  E:BlokKelas  F:Catatan
 *    G:Gambar1  H:Gambar2  I:DicatatOleh  J:MasaHantar
 * 3. Extensions > Apps Script — buat projek BAHARU (New project), padam kod
 *    default, tampal SEMUA kod ni
 * 4. Deploy > New deployment > ikon gear > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Salin URL (.../exec), paste ke LPB_API_URL dalam laporan-pentadbir.js
 * 6. Pastikan folder Google Drive untuk gambar (LPB_FOLDER_ID di bawah) sudah
 *    dikongsi supaya akaun yang deploy (Execute as: Me) ada akses Editor.
 *
 * ⚠️ Bila kod ni diubah & disimpan semula, WAJIB buat "New version" di
 * Manage deployments, atau URL .../exec akan terus guna kod LAMA.
 */

var LPB_SHEET_ID = "16DsM_I0pRsQ41gFVRWHTk8XDbDn8M7LOkiWGPin1fPQ";
var LPB_TAB_NAME = "List Laporan";
var LPB_FOLDER_ID = "1c1kgKvFVz2v6lbW7Tm4xS0sJj9Dalef8";

// Spreadsheet APP SMASRA utama (tempat tab DatabaseSTAFF) — untuk semak Role2=Pentadbir.
// Akaun yang "Execute as: Me" semasa deploy projek ni perlu ada akses baca ke sheet ni juga.
var LPB_MAIN_SHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";
var LPB_STAF_COL_EMEL1 = 4, LPB_STAF_COL_EMEL2 = 5, LPB_STAF_COL_ROLE2 = 7;

// Lajur (bermula 0)
var C_ID = 0, C_TARIKH = 1, C_MASA = 2, C_NAMA = 3, C_BLOK = 4, C_CATATAN = 5,
    C_GAMBAR1 = 6, C_GAMBAR2 = 7, C_DICATAT = 8, C_HANTAR = 9;

function doGet(e) {
  var action = e.parameter.action;
  if (action === "getLaporanPentadbir") return getLaporanPentadbir();
  if (action === "ping") return lpbJson({ ok: true });
  return lpbJson({ error: "Unknown action: " + action });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return lpbJson({ success: false, message: "Data tidak sah." });
  }
  if (body.action === "addLaporanPentadbir") return addLaporanPentadbir(body);
  if (body.action === "deleteLaporanPentadbir") return deleteLaporanPentadbir(body);
  return lpbJson({ success: false, message: "Unknown action: " + body.action });
}

function lpbJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function lpbGetSheet() {
  var sheet = SpreadsheetApp.openById(LPB_SHEET_ID).getSheetByName(LPB_TAB_NAME);
  if (!sheet) throw new Error('Tab "' + LPB_TAB_NAME + '" tidak dijumpai dalam Sheet.');
  return sheet;
}

/**
 * Semak Role2 (lajur H) staf dalam DatabaseSTAFF sheet utama.
 * Pulang true HANYA jika Role2 === "Pentadbir" (tak kira besar/kecil huruf).
 */
function lpbIsPentadbir(email) {
  if (!email) return false;
  try {
    var sheet = SpreadsheetApp.openById(LPB_MAIN_SHEET_ID).getSheetByName("DatabaseSTAFF");
    if (!sheet) return false;
    var data = sheet.getDataRange().getValues();
    var target = String(email).trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var emel1 = String(row[LPB_STAF_COL_EMEL1] || "").trim().toLowerCase();
      var emel2 = String(row[LPB_STAF_COL_EMEL2] || "").trim().toLowerCase();
      if (emel1 === target || emel2 === target) {
        var role2 = String(row[LPB_STAF_COL_ROLE2] || "").trim().toLowerCase();
        return role2 === "pentadbir";
      }
    }
    return false;
  } catch (err) {
    // Kalau gagal sambung ke sheet utama (contoh: tiada akses), gagal selamat = tolak akses.
    return false;
  }
}

function lpbFmtDate(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "GMT+8", "dd/MM/yyyy");
}

/**
 * body.tarikh dijangka format "dd/mm/yyyy" (dari frontend)
 */
function lpbParseDate(tarikhStr) {
  var parts = String(tarikhStr).split("/");
  if (parts.length !== 3) throw new Error("Format tarikh tidak sah.");
  return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
}

/* ---------------- GET senarai ---------------- */

function getLaporanPentadbir() {
  try {
    var sheet = lpbGetSheet();
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[C_TARIKH] || !row[C_BLOK]) continue;
      list.push({
        id: row[C_ID] || "",
        tarikh: lpbFmtDate(row[C_TARIKH]),
        masa: row[C_MASA] || "",
        namaPentadbir: row[C_NAMA] || "",
        blokKelas: row[C_BLOK] || "",
        catatan: row[C_CATATAN] || "",
        gambar1: row[C_GAMBAR1] || "",
        gambar2: row[C_GAMBAR2] || "",
        dicatatOleh: row[C_DICATAT] || "",
      });
    }
    return lpbJson(list);
  } catch (err) {
    return lpbJson([]);
  }
}

/* ---------------- POST tambah rekod ---------------- */

function lpbUploadImage(imgObj, filenamePrefix) {
  if (!imgObj || !imgObj.data) return "";
  try {
    var folder = DriveApp.getFolderById(LPB_FOLDER_ID);
    var mimeType = imgObj.mimeType || "image/jpeg";
    var bytes = Utilities.base64Decode(imgObj.data);
    var blob = Utilities.newBlob(bytes, mimeType, filenamePrefix + ".jpg");
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (err) {
    return "";
  }
}

function addLaporanPentadbir(body) {
  if (!body.namaPentadbir || !body.tarikh || !body.masa || !body.blokKelas || !body.catatan) {
    return lpbJson({ success: false, message: "Sila lengkapkan semua ruangan wajib." });
  }
  if (!lpbIsPentadbir(body.email)) {
    return lpbJson({ success: false, message: "Akses ditolak. Modul ini hanya untuk Pentadbir." });
  }
  try {
    var tarikhDate = lpbParseDate(body.tarikh);
    var sheet = lpbGetSheet();
    var id = Utilities.getUuid();
    var namePrefix = "LPB_" + body.tarikh.replace(/\//g, "-") + "_" + id.slice(0, 8);

    var url1 = lpbUploadImage(body.gambar1, namePrefix + "_1");
    var url2 = lpbUploadImage(body.gambar2, namePrefix + "_2");

    sheet.appendRow([
      id, tarikhDate, body.masa, body.namaPentadbir, body.blokKelas, body.catatan,
      url1, url2, body.email || "", new Date(),
    ]);
    return lpbJson({ success: true });
  } catch (err) {
    return lpbJson({ success: false, message: "Ralat simpan: " + err.message });
  }
}

/* ---------------- POST padam (satu laporan = semua baris Nama+Tarikh) ---------------- */

function lpbExtractDriveFileId(url) {
  var m = String(url || "").match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function deleteLaporanPentadbir(body) {
  if (!body.tarikh || !body.namaPentadbir) {
    return lpbJson({ success: false, message: "Maklumat tidak lengkap untuk padam." });
  }
  if (!lpbIsPentadbir(body.email)) {
    return lpbJson({ success: false, message: "Akses ditolak. Modul ini hanya untuk Pentadbir." });
  }
  try {
    var sheet = lpbGetSheet();
    var data = sheet.getDataRange().getValues();
    var targetTarikh = body.tarikh.trim();
    var targetNama = String(body.namaPentadbir).trim();
    var deletedRows = 0;

    for (var i = data.length - 1; i >= 1; i--) {
      var row = data[i];
      if (!row[C_TARIKH]) continue;
      var rowTarikh = lpbFmtDate(row[C_TARIKH]);
      var rowNama = String(row[C_NAMA] || "").trim();
      if (rowTarikh === targetTarikh && rowNama === targetNama) {
        [row[C_GAMBAR1], row[C_GAMBAR2]].forEach(function (url) {
          var fileId = lpbExtractDriveFileId(url);
          if (fileId) {
            try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* abaikan */ }
          }
        });
        sheet.deleteRow(i + 1);
        deletedRows++;
      }
    }
    if (deletedRows === 0) {
      return lpbJson({ success: false, message: "Laporan tidak dijumpai." });
    }
    return lpbJson({ success: true, deletedRows: deletedRows });
  } catch (err) {
    return lpbJson({ success: false, message: "Ralat padam: " + err.message });
  }
}
