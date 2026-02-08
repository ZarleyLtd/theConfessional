/**
 * Bar Bill Claims – Google Apps Script Web App
 * Serves: dates with bills, bill for date, claims for date, config (names), product icons, submit claims.
 * Sheets: Config (Name), Bills, Claims, ProductIcons (Product, Image)
 */

var SHEETS = {
  CONFIG: 'Config',
  BILLS: 'Bills',
  CLAIMS: 'Claims',
  PRODUCT_ICONS: 'ProductIcons',
  BILL_META: 'BillMeta'
};

/** Run this once from the editor (Run > authorizeDrive) to grant Drive access, then deploy a new version of the Web App. */
function authorizeDrive() {
  DriveApp.getRootFolder().getName();
}

function doGet(e) {
  var result = { error: null, data: null };
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
    var params = e ? e.parameter : {};
    if (action === 'dates') {
      result.data = getDatesWithBills();
    } else if (action === 'bill') {
      var date = params.date;
      if (!date) throw new Error('Missing date');
      result.data = getBillForDate(date);
    } else if (action === 'claims') {
      var date = params.date;
      if (!date) throw new Error('Missing date');
      result.data = getClaimsForDate(date);
    } else if (action === 'config') {
      result.data = getConfigNames();
    } else if (action === 'productIcons') {
      result.data = getProductIcons();
    } else if (action === 'getBillImage') {
      var date = params.date;
      if (!date) throw new Error('Missing date');
      result.data = getBillImage(date);
    } else {
      throw new Error('Unknown or missing action');
    }
  } catch (err) {
    result.error = err.message || String(err);
  }
  return responseJson(result);
}

function doPost(e) {
  var result = { error: null, data: null };
  try {
    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = body.action || (e.parameter && e.parameter.action);
    if (action === 'submitClaims') {
      result.data = submitClaims(body);
    } else {
      throw new Error('Unknown or missing action');
    }
  } catch (err) {
    result.error = err.message || String(err);
  }
  return responseJson(result);
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getDatesWithBills() {
  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  if (!billsSheet) return [];
  var data = billsSheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0];
  var dateCol = header.indexOf('Date');
  if (dateCol < 0) return [];
  var dateSet = {};
  for (var i = 1; i < data.length; i++) {
    var val = data[i][dateCol];
    if (val) {
      var d = formatDate(val);
      if (d) dateSet[d] = true;
    }
  }
  var dates = Object.keys(dateSet).sort();
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  var openByDate = {};
  if (metaSheet) {
    var metaData = metaSheet.getDataRange().getValues();
    if (metaData.length >= 2) {
      var metaHeader = metaData[0];
      var metaDateCol = metaHeader.indexOf('Date');
      var metaOpenCol = metaHeader.indexOf('Open');
      if (metaDateCol >= 0 && metaOpenCol >= 0) {
        for (var j = 1; j < metaData.length; j++) {
          var row = metaData[j];
          var dateStr = formatDate(row[metaDateCol]);
          if (dateStr) {
            var v = row[metaOpenCol];
            openByDate[dateStr] = v === true || (typeof v === 'string' && v.toUpperCase() === 'TRUE');
          }
        }
      }
    }
  }
  var result = [];
  for (var k = 0; k < dates.length; k++) {
    result.push({ date: dates[k], open: openByDate[dates[k]] === true });
  }
  return result;
}

function formatDate(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  // Accept other string date formats (e.g. "07/02/2026", "2/7/2026") so imported/pasted dates are not dropped
  if (typeof val === 'string') {
    var parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      var y = parsed.getFullYear();
      var m = ('0' + (parsed.getMonth() + 1)).slice(-2);
      var d = ('0' + parsed.getDate()).slice(-2);
      return y + '-' + m + '-' + d;
    }
  }
  return null;
}

/** Extract Drive file ID from a cell value that may be a raw ID or a full URL/path. */
function normalizeDriveFileId(val) {
  if (val == null || String(val).trim() === '') return null;
  var s = String(val).trim();
  var match = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return s;
}

function getBillMetaForDate(dateStr) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!sheet) return { billImageId: null, open: false };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { billImageId: null, open: false };
  var header = data[0];
  var dateCol = header.indexOf('Date');
  var imageIdCol = header.indexOf('BillImageId');
  var openCol = header.indexOf('Open');
  if (dateCol < 0 || imageIdCol < 0) return { billImageId: null, open: false };
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (formatDate(row[dateCol]) === dateStr) {
      var id = (row[imageIdCol] != null && String(row[imageIdCol]).trim() !== '') ? String(row[imageIdCol]).trim() : null;
      var isOpen = false;
      if (openCol >= 0 && row[openCol] != null) {
        var v = row[openCol];
        isOpen = v === true || (typeof v === 'string' && v.toUpperCase() === 'TRUE');
      }
      return { billImageId: id, open: isOpen };
    }
  }
  return { billImageId: null, open: false };
}

function getBillForDate(date) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.BILLS);
  if (!sheet) return { items: [], metadata: { billImageUrl: null } };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { items: [], metadata: { billImageUrl: null } };
  var header = data[0];
  var col = function (name) { return header.indexOf(name); };
  var dateCol = col('Date');
  var rowIndexCol = col('RowIndex');
  var categoryCol = col('Category');
  var descCol = col('Description');
  var qtyCol = col('Quantity');
  var unitPriceCol = col('UnitPrice');
  var totalPriceCol = col('TotalPrice');
  if (dateCol < 0 || categoryCol < 0 || descCol < 0 || qtyCol < 0) return { items: [], metadata: { billImageUrl: null } };
  var dateStr = formatDate(date);
  if (!dateStr) return { items: [], metadata: { billImageUrl: null } };
  var items = [];
  var runningIndex = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowDate = formatDate(row[dateCol]);
    if (rowDate !== dateStr) continue;
    var rowIndex = rowIndexCol >= 0 && row[rowIndexCol] !== '' ? (Number(row[rowIndexCol])) : runningIndex;
    runningIndex++;
    items.push({
      rowIndex: rowIndex,
      category: row[categoryCol] != null ? String(row[categoryCol]) : '',
      description: row[descCol] != null ? String(row[descCol]) : '',
      quantity: parseInt(row[qtyCol], 10) || 0,
      unit_price: parseFloat(row[unitPriceCol]) || 0,
      total_price: parseFloat(row[totalPriceCol]) || 0
    });
  }
  var meta = getBillMetaForDate(dateStr);
  var fileId = normalizeDriveFileId(meta.billImageId);
  var billImageUrl = fileId
    ? ('https://drive.google.com/file/d/' + fileId + '/view')
    : null;
  return { items: items, metadata: { billImageUrl: billImageUrl } };
}

function getBillImage(date) {
  var dateStr = formatDate(date);
  if (!dateStr) throw new Error('Invalid date');
  var meta = getBillMetaForDate(dateStr);
  var fileId = normalizeDriveFileId(meta.billImageId);
  if (!fileId) throw new Error('No bill image for this date');
  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var mimeType = blob.getContentType() || 'image/jpeg';
  var base64 = Utilities.base64Encode(blob.getBytes());
  return { mimeType: mimeType, base64: base64 };
}

function getClaimsForDate(date) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0];
  var dateCol = header.indexOf('Date');
  var userCol = header.indexOf('UserName');
  var rowIndexCol = header.indexOf('RowIndex');
  var unitIndexCol = header.indexOf('UnitIndex');
  if (dateCol < 0 || userCol < 0 || rowIndexCol < 0 || unitIndexCol < 0) return [];
  var dateStr = formatDate(date);
  if (!dateStr) return [];
  var claims = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (formatDate(row[dateCol]) !== dateStr) continue;
    claims.push({
      date: formatDate(row[dateCol]),
      userName: String(row[userCol] || ''),
      rowIndex: parseInt(row[rowIndexCol], 10) || 0,
      unitIndex: parseInt(row[unitIndexCol], 10) || 0
    });
  }
  return claims;
}

function getConfigNames() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0];
  var nameCol = header.indexOf('Name');
  if (nameCol < 0) return [];
  var names = [];
  for (var i = 1; i < data.length; i++) {
    var n = data[i][nameCol];
    if (n != null && String(n).trim() !== '') names.push(String(n).trim());
  }
  return names;
}

function getProductIcons() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.PRODUCT_ICONS);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0];
  var productCol = -1;
  var imageCol = -1;
  for (var h = 0; h < header.length; h++) {
    var val = (header[h] != null ? String(header[h]) : '').trim().toLowerCase();
    if (val === 'product') productCol = h;
    if (val === 'image') imageCol = h;
  }
  if (productCol < 0 || imageCol < 0) return [];
  var rules = [];
  for (var i = 1; i < data.length; i++) {
    var product = data[i][productCol] != null ? String(data[i][productCol]).trim() : '';
    var image = data[i][imageCol] != null ? String(data[i][imageCol]).trim() : '';
    if (product !== '' && image !== '') {
      rules.push({ product: product, image: image });
    }
  }
  return rules;
}

function submitClaims(body) {
  var date = body.date;
  var userName = body.userName;
  var claims = body.claims;
  if (!date || userName == null || userName === '') throw new Error('Missing date or userName');
  if (!Array.isArray(claims)) claims = [];
  var dateStr = formatDate(date);
  if (!dateStr) throw new Error('Invalid date');

  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var claimsSheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!billsSheet || !claimsSheet) throw new Error('Sheets not found');

  var billData = billsSheet.getDataRange().getValues();
  var billHeader = billData[0];
  var dateCol = billHeader.indexOf('Date');
  var rowIndexCol = billHeader.indexOf('RowIndex');
  var qtyCol = billHeader.indexOf('Quantity');
  if (dateCol < 0 || rowIndexCol < 0 || qtyCol < 0) throw new Error('Bills sheet missing columns');

  var validSlots = {};
  var runIdx = 0;
  for (var i = 1; i < billData.length; i++) {
    var row = billData[i];
    if (formatDate(row[dateCol]) !== dateStr) continue;
    var ri = rowIndexCol >= 0 && row[rowIndexCol] !== '' ? parseInt(row[rowIndexCol], 10) : runIdx;
    if (isNaN(ri)) ri = runIdx;
    runIdx++;
    var qty = parseInt(row[qtyCol], 10) || 0;
    for (var u = 0; u < qty; u++) validSlots[ri + '_' + u] = true;
  }

  for (var c = 0; c < claims.length; c++) {
    var r = claims[c].rowIndex;
    var u = claims[c].unitIndex;
    if (typeof r !== 'number' || typeof u !== 'number') continue;
    if (!validSlots[r + '_' + u]) throw new Error('Invalid slot: rowIndex ' + r + ', unitIndex ' + u);
  }

  var claimsData = claimsSheet.getDataRange().getValues();
  var claimsHeader = claimsData[0];
  var cDateCol = claimsHeader.indexOf('Date');
  var cUserCol = claimsHeader.indexOf('UserName');
  var cRowCol = claimsHeader.indexOf('RowIndex');
  var cUnitCol = claimsHeader.indexOf('UnitIndex');
  if (cDateCol < 0 || cUserCol < 0 || cRowCol < 0 || cUnitCol < 0) throw new Error('Claims sheet missing columns');

  var claimedByOthers = {};
  for (var i = 1; i < claimsData.length; i++) {
    var row = claimsData[i];
    if (formatDate(row[cDateCol]) !== dateStr) continue;
    if (String(row[cUserCol] || '') === String(userName)) continue;
    var ri = parseInt(row[cRowCol], 10);
    var ui = parseInt(row[cUnitCol], 10);
    if (!isNaN(ri) && !isNaN(ui)) claimedByOthers[ri + '_' + ui] = true;
  }
  for (var c = 0; c < claims.length; c++) {
    var r = claims[c].rowIndex;
    var u = claims[c].unitIndex;
    if (typeof r !== 'number' || typeof u !== 'number') continue;
    if (claimedByOthers[r + '_' + u]) {
      throw new Error('Slot already claimed by another user: rowIndex ' + r + ', unitIndex ' + u);
    }
  }

  var toDelete = [];
  for (var j = 1; j < claimsData.length; j++) {
    if (formatDate(claimsData[j][cDateCol]) === dateStr && String(claimsData[j][cUserCol] || '') === String(userName)) {
      toDelete.push(j + 1);
    }
  }
  for (var d = toDelete.length - 1; d >= 0; d--) {
    claimsSheet.deleteRow(toDelete[d]);
  }

  for (var k = 0; k < claims.length; k++) {
    claimsSheet.appendRow([
      dateStr,
      String(userName),
      parseInt(claims[k].rowIndex, 10),
      parseInt(claims[k].unitIndex, 10)
    ]);
  }

  // Build updated claims list for this date (same shape as getClaimsForDate) so client can skip a second request
  var updatedClaims = [];
  for (var j = 1; j < claimsData.length; j++) {
    var rowNum = j + 1;
    if (toDelete.indexOf(rowNum) >= 0) continue;
    var row = claimsData[j];
    if (formatDate(row[cDateCol]) !== dateStr) continue;
    updatedClaims.push({
      date: formatDate(row[cDateCol]),
      userName: String(row[cUserCol] || ''),
      rowIndex: parseInt(row[cRowCol], 10) || 0,
      unitIndex: parseInt(row[cUnitCol], 10) || 0
    });
  }
  for (var k = 0; k < claims.length; k++) {
    updatedClaims.push({
      date: dateStr,
      userName: String(userName),
      rowIndex: parseInt(claims[k].rowIndex, 10),
      unitIndex: parseInt(claims[k].unitIndex, 10)
    });
  }
  return { ok: true, count: claims.length, claims: updatedClaims };
}
