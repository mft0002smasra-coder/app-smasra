const SPREADSHEET_ID = '16DsM_I0pRsQ41gFVRWHTk8XDbDn8M7LOkiWGPin1fPQ';
const FOLDER_ID = '1c1kgKvFVz2v6lbW7Tm4xS0sJj9Dalef8';
const SHEET_NAME = 'List Laporan';

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["ID", "Nama Pentadbir", "Tarikh", "Masa", "Lokasi", "Catatan", "Gambar1", "Gambar2"]);
    }
    
    if (action === 'getReports') {
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        return createJSONOutput({ status: 'success', data: [] });
      }
      
      const rows = data.slice(1);
      const reports = rows.map((row, index) => {
        return {
          id: row[0] || (index + 1),
          nama: row[1],
          tarikh: formatDate(row[2]),
          masa: formatTime(row[3]),
          lokasi: row[4],
          catatan: row[5],
          gambar1: row[6] || '',
          gambar2: row[7] || ''
        };
      }).reverse();
      
      return createJSONOutput({ status: 'success', data: reports });
    }
    
    return createJSONOutput({ status: 'success', message: 'Apps Script Ready' });
  } catch (err) {
    return createJSONOutput({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["ID", "Nama Pentadbir", "Tarikh", "Masa", "Lokasi", "Catatan", "Gambar1", "Gambar2"]);
    }
    
    if (action === 'addReport') {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      let imgUrl1 = '';
      let imgUrl2 = '';
      
      if (contents.gambar1 && contents.gambar1.base64) {
        const blob1 = Utilities.newBlob(
          Utilities.base64Decode(contents.gambar1.base64),
          contents.gambar1.type,
          contents.gambar1.name
        );
        const file1 = folder.createFile(blob1);
        file1.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imgUrl1 = "https://lh3.googleusercontent.com/d/" + file1.getId();
      }
      
      if (contents.gambar2 && contents.gambar2.base64) {
        const blob2 = Utilities.newBlob(
          Utilities.base64Decode(contents.gambar2.base64),
          contents.gambar2.type,
          contents.gambar2.name
        );
        const file2 = folder.createFile(blob2);
        file2.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imgUrl2 = "https://lh3.googleusercontent.com/d/" + file2.getId();
      }
      
      const reportId = Date.now().toString();
      sheet.appendRow([
        reportId,
        contents.nama,
        contents.tarikh,
        contents.masa,
        contents.lokasi,
        contents.catatan,
        imgUrl1,
        imgUrl2
      ]);
      
      return createJSONOutput({ status: 'success', message: 'Laporan berjaya disimpan!' });
    }
    
    if (action === 'deleteReport') {
      const targetId = contents.id;
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString() === targetId.toString()) {
          sheet.deleteRow(i + 1);
          return createJSONOutput({ status: 'success', message: 'Laporan berjaya dipadam!' });
        }
      }
      return createJSONOutput({ status: 'error', message: 'Laporan tidak dijumpai.' });
    }
  } catch (err) {
    return createJSONOutput({ status: 'error', message: err.toString() });
  }
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return val.toString();
}

function formatTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const hh = String(val.getHours()).padStart(2, '0');
    const mm = String(val.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return val.toString();
}

function createJSONOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}