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

/** Run this once from the editor (Run > authorizeExternalRequests) to grant permission for external API calls (Gemini). */
function authorizeExternalRequests() {
  UrlFetchApp.fetch('https://www.google.com');
  Logger.log('External request permission granted.');
}

/** Run this once to grant all permissions needed for bill upload (Drive + external APIs). Then deploy a new version. */
function authorizeAll() {
  var root = DriveApp.getRootFolder();
  root.getName();
  var blob = Utilities.newBlob('ok', 'text/plain', 'temp-auth-check.txt');
  var temp = root.createFile(blob);
  temp.setTrashed(true);
  UrlFetchApp.fetch('https://www.google.com');
  Logger.log('All permissions granted (Drive createFile + external requests).');
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
    } else if (action === 'getAllBillsFull') {
      result.data = getAllBillsFull();
    } else if (action === 'getBillsSummary') {
      result.data = getBillsSummary();
    } else if (action === 'getBillFull') {
      var date = params.date;
      if (!date) throw new Error('Missing date');
      result.data = getBillFull(date);
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
    } else if (action === 'analyzeBillImage') {
      result.data = analyzeBillImage(body);
    } else if (action === 'completeBillUpload') {
      result.data = completeBillUpload(body);
    } else if (action === 'deleteBill') {
      result.data = deleteBill(body);
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
  if (!sheet) return { billImageId: null, open: false, totalPaid: null };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { billImageId: null, open: false, totalPaid: null };
  var header = data[0];
  var dateCol = header.indexOf('Date');
  var imageIdCol = header.indexOf('BillImageId');
  var openCol = header.indexOf('Open');
  var totalPaidCol = -1;
  for (var h = 0; h < header.length; h++) {
    if ((header[h] || '').toString().toLowerCase() === 'totalpaid') {
      totalPaidCol = h;
      break;
    }
  }
  if (totalPaidCol < 0 && header.length >= 4) totalPaidCol = 3;
  if (dateCol < 0 || imageIdCol < 0) return { billImageId: null, open: false, totalPaid: null };
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (formatDate(row[dateCol]) === dateStr) {
      var id = (row[imageIdCol] != null && String(row[imageIdCol]).trim() !== '') ? String(row[imageIdCol]).trim() : null;
      var isOpen = false;
      if (openCol >= 0 && row[openCol] != null) {
        var v = row[openCol];
        isOpen = v === true || (typeof v === 'string' && v.toUpperCase() === 'TRUE');
      }
      var totalPaid = null;
      if (totalPaidCol >= 0 && row[totalPaidCol] != null && row[totalPaidCol] !== '') {
        var tp = parseFloat(row[totalPaidCol]);
        if (!isNaN(tp) && tp >= 0) totalPaid = tp;
      }
      return { billImageId: id, open: isOpen, totalPaid: totalPaid };
    }
  }
  return { billImageId: null, open: false, totalPaid: null };
}

function hasBillMetaForDate(dateStr) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var header = data[0];
  var dateCol = header.indexOf('Date');
  if (dateCol < 0) return false;
  for (var i = 1; i < data.length; i++) {
    if (formatDate(data[i][dateCol]) === dateStr) return true;
  }
  return false;
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

/** Power user: return all bills with full items and claims in one call. Bulk reads (3 sheet reads total). */
function getAllBillsFull() {
  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  var claimsSheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!billsSheet) return { bills: [] };

  var billsData = billsSheet.getDataRange().getValues();
  var metaData = metaSheet ? metaSheet.getDataRange().getValues() : [];
  var claimsData = claimsSheet ? claimsSheet.getDataRange().getValues() : [];

  var billHeader = billsData[0] || [];
  var bDateCol = billHeader.indexOf('Date');
  var bRowIndexCol = billHeader.indexOf('RowIndex');
  var bCategoryCol = billHeader.indexOf('Category');
  var bDescCol = billHeader.indexOf('Description');
  var bQtyCol = billHeader.indexOf('Quantity');
  var bUnitPriceCol = billHeader.indexOf('UnitPrice');
  var bTotalPriceCol = billHeader.indexOf('TotalPrice');
  if (bDateCol < 0 || bCategoryCol < 0 || bDescCol < 0 || bQtyCol < 0) return { bills: [] };

  var itemsByDate = {};
  var dateSet = {};
  var runIdxByDate = {};
  for (var i = 1; i < billsData.length; i++) {
    var row = billsData[i];
    var dateStr = formatDate(row[bDateCol]);
    if (!dateStr) continue;
    dateSet[dateStr] = true;
    var runIdx = runIdxByDate[dateStr] || 0;
    var rowIndex = bRowIndexCol >= 0 && row[bRowIndexCol] !== '' ? Number(row[bRowIndexCol]) : runIdx;
    runIdxByDate[dateStr] = runIdx + 1;
    if (!itemsByDate[dateStr]) itemsByDate[dateStr] = [];
    itemsByDate[dateStr].push({
      rowIndex: rowIndex,
      category: row[bCategoryCol] != null ? String(row[bCategoryCol]) : '',
      description: row[bDescCol] != null ? String(row[bDescCol]) : '',
      quantity: parseInt(row[bQtyCol], 10) || 0,
      unit_price: parseFloat(row[bUnitPriceCol]) || 0,
      total_price: parseFloat(row[bTotalPriceCol]) || 0
    });
  }

  var openByDate = {};
  if (metaData.length >= 2) {
    var metaHeader = metaData[0];
    var metaDateCol = metaHeader.indexOf('Date');
    var metaOpenCol = metaHeader.indexOf('Open');
    if (metaDateCol >= 0 && metaOpenCol >= 0) {
      for (var j = 1; j < metaData.length; j++) {
        var mRow = metaData[j];
        var d = formatDate(mRow[metaDateCol]);
        if (d) {
          var v = mRow[metaOpenCol];
          openByDate[d] = v === true || (typeof v === 'string' && v.toUpperCase() === 'TRUE');
        }
      }
    }
  }

  var claimsByDate = {};
  if (claimsData.length >= 2) {
    var claimsHeader = claimsData[0];
    var cDateCol = claimsHeader.indexOf('Date');
    var cUserCol = claimsHeader.indexOf('UserName');
    var cRowCol = claimsHeader.indexOf('RowIndex');
    var cUnitCol = claimsHeader.indexOf('UnitIndex');
    if (cDateCol >= 0 && cUserCol >= 0 && cRowCol >= 0 && cUnitCol >= 0) {
      for (var k = 1; k < claimsData.length; k++) {
        var cRow = claimsData[k];
        var cDate = formatDate(cRow[cDateCol]);
        if (!cDate) continue;
        if (!claimsByDate[cDate]) claimsByDate[cDate] = [];
        claimsByDate[cDate].push({
          date: cDate,
          userName: String(cRow[cUserCol] || ''),
          rowIndex: parseInt(cRow[cRowCol], 10) || 0,
          unitIndex: parseInt(cRow[cUnitCol], 10) || 0
        });
      }
    }
  }

  var dates = Object.keys(dateSet).sort();
  var bills = [];
  for (var n = 0; n < dates.length; n++) {
    var dateStr = dates[n];
    bills.push({
      date: dateStr,
      open: openByDate[dateStr] === true,
      items: itemsByDate[dateStr] || [],
      claims: claimsByDate[dateStr] || []
    });
  }
  return { bills: bills };
}

/** Power user: lightweight summary for initial load. Returns [{ date, open, hasClaims }]. */
function getBillsSummary() {
  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  var claimsSheet = ss.getSheetByName(SHEETS.CLAIMS);
  if (!billsSheet) return { bills: [] };

  var billsData = billsSheet.getDataRange().getValues();
  var metaData = metaSheet ? metaSheet.getDataRange().getValues() : [];
  var claimsData = claimsSheet ? claimsSheet.getDataRange().getValues() : [];

  var billHeader = billsData[0] || [];
  var bDateCol = billHeader.indexOf('Date');
  if (bDateCol < 0) return { bills: [] };

  var dateSet = {};
  for (var i = 1; i < billsData.length; i++) {
    var d = formatDate(billsData[i][bDateCol]);
    if (d) dateSet[d] = true;
  }

  var openByDate = {};
  if (metaData.length >= 2) {
    var metaHeader = metaData[0];
    var metaDateCol = metaHeader.indexOf('Date');
    var metaOpenCol = metaHeader.indexOf('Open');
    if (metaDateCol >= 0 && metaOpenCol >= 0) {
      for (var j = 1; j < metaData.length; j++) {
        var mRow = metaData[j];
        var d = formatDate(mRow[metaDateCol]);
        if (d) {
          var v = mRow[metaOpenCol];
          openByDate[d] = v === true || (typeof v === 'string' && v.toUpperCase() === 'TRUE');
        }
      }
    }
  }

  var hasClaimsByDate = {};
  if (claimsData.length >= 2) {
    var claimsHeader = claimsData[0];
    var cDateCol = claimsHeader.indexOf('Date');
    if (cDateCol >= 0) {
      for (var k = 1; k < claimsData.length; k++) {
        var cDate = formatDate(claimsData[k][cDateCol]);
        if (cDate) hasClaimsByDate[cDate] = true;
      }
    }
  }

  var dates = Object.keys(dateSet).sort();
  var bills = [];
  for (var n = 0; n < dates.length; n++) {
    var dateStr = dates[n];
    bills.push({
      date: dateStr,
      open: openByDate[dateStr] === true,
      hasClaims: hasClaimsByDate[dateStr] === true
    });
  }
  return { bills: bills };
}

/** Power user: full bill data for one date. Used when expanding or prefetching. */
function getBillFull(date) {
  var dateStr = formatDate(date);
  if (!dateStr) throw new Error('Invalid date');
  var billData = getBillForDate(dateStr);
  var claimsData = getClaimsForDate(dateStr);
  var meta = getBillMetaForDate(dateStr);
  return {
    date: dateStr,
    open: meta.open === true,
    totalPaid: meta.totalPaid,
    items: billData.items || [],
    claims: claimsData || []
  };
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

  var userNameLower = String(userName || '').toLowerCase();
  var claimedByOthers = {};
  for (var i = 1; i < claimsData.length; i++) {
    var row = claimsData[i];
    if (formatDate(row[cDateCol]) !== dateStr) continue;
    if (String(row[cUserCol] || '').toLowerCase() === userNameLower) continue;
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
    if (formatDate(claimsData[j][cDateCol]) === dateStr && String(claimsData[j][cUserCol] || '').toLowerCase() === userNameLower) {
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

/**
 * Power user: Phase 1 - analyze bill image with Gemini, store result, return jobId.
 * body: { base64: string, mimeType: string }
 */
function analyzeBillImage(body) {
  var base64 = body.base64;
  var mimeType = body.mimeType || 'image/jpeg';
  if (!base64) throw new Error('Missing image data');

  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in script properties');

  var prompt = 'Analyze this receipt/bill image and extract all line items. Return ONLY valid JSON (no markdown, no code blocks) with this exact structure: {"date":"YYYY-MM-DD","items":[{"category":"Food" or "Fries" or "Drink","description":"item name","quantity":1,"unit_price":12.00,"total_price":12.00}]}. Use category "Food" for main dishes/sandwiches, "Fries" for fries/sides, "Drink" for beverages. If you cannot determine the date, use today in YYYY-MM-DD.';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
  var payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt }
      ]
    }]
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) {
    var err = JSON.parse(text || '{}');
    throw new Error(err.error && err.error.message ? err.error.message : 'Gemini API error: ' + code);
  }
  var json = JSON.parse(text);
  var textPart = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0];
  var extractedText = textPart ? (textPart.text || '') : '';
  if (!extractedText) throw new Error('No extraction result from Gemini');

  var parsed = parseGeminiBillJson(extractedText);
  var dateStr = parsed.date || formatDate(new Date());
  if (hasBillMetaForDate(dateStr)) {
    throw new Error('A bill already exists for ' + dateStr + '. Delete it first if you want to replace it.');
  }
  var jobId = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('billUpload_' + jobId, JSON.stringify(parsed));
  return { jobId: jobId };
}

function parseGeminiBillJson(text) {
  var cleaned = text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  var parsed = JSON.parse(cleaned);
  if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
  var dateStr = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date)) ? parsed.date : formatDate(new Date());
  parsed.date = dateStr;
  return parsed;
}

/**
 * Power user: Phase 2 - complete upload using jobId + paidAmount.
 * body: { jobId: string, paidAmount: number, base64: string, mimeType: string }
 */
function completeBillUpload(body) {
  var jobId = body.jobId;
  var paidAmount = parseFloat(body.paidAmount);
  var base64 = body.base64;
  var mimeType = body.mimeType || 'image/jpeg';
  if (!jobId) throw new Error('Missing jobId');
  if (isNaN(paidAmount) || paidAmount < 0) throw new Error('Invalid paidAmount');

  var stored = PropertiesService.getScriptProperties().getProperty('billUpload_' + jobId);
  if (!stored) throw new Error('Analysis expired or invalid jobId');
  var analysis = JSON.parse(stored);

  var ss = getSpreadsheet();
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!billsSheet || !metaSheet) throw new Error('Bills or BillMeta sheet not found');

  var dateStr = analysis.date || formatDate(new Date());
  var imageBytes = base64 ? Utilities.base64Decode(base64) : null;

  var fileId = null;
  if (imageBytes && imageBytes.length > 0) {
    var blob = Utilities.newBlob(imageBytes, mimeType, 'bill.jpg');
    var folder = getOrCreateDriveFolder('theConfessional');
    var fileName = 'bill-' + dateStr + '-' + Date.now() + '.jpg';
    var file = folder.createFile(blob.setName(fileName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = file.getId();
  }

  var items = analysis.items || [];
  var rowIndex = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cat = (it.category || 'Drink').trim();
    var desc = (it.description || '').trim();
    var qty = parseInt(it.quantity, 10) || 1;
    var unitPrice = parseFloat(it.unit_price) || 0;
    var totalPrice = parseFloat(it.total_price) || (unitPrice * qty);
    billsSheet.appendRow([dateStr, rowIndex, cat, desc, qty, unitPrice, totalPrice]);
    rowIndex++;
  }

  var metaHeader = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0];
  var hasTotalPaid = metaHeader.some(function (h) { return (h || '').toString().toLowerCase() === 'totalpaid'; });
  if (!hasTotalPaid && metaSheet.getLastRow() === 1) {
    metaSheet.getRange(1, 4).setValue('TotalPaid');
  }
  metaSheet.appendRow([dateStr, fileId || '', true, paidAmount]);

  var billTotal = items.reduce(function (sum, it) {
    var tp = parseFloat(it.total_price);
    if (!isNaN(tp)) return sum + tp;
    var up = parseFloat(it.unit_price) || 0;
    var q = parseInt(it.quantity, 10) || 1;
    return sum + up * q;
  }, 0);
  var tipAmount = Math.max(0, paidAmount - billTotal);

  PropertiesService.getScriptProperties().deleteProperty('billUpload_' + jobId);
  return {
    date: dateStr,
    billTotal: billTotal,
    tipAmount: tipAmount,
    totalPaid: paidAmount
  };
}

function getOrCreateDriveFolder(name) {
  var iter = DriveApp.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return DriveApp.getRootFolder().createFolder(name);
}

/**
 * Power user: delete a bill. Only allowed when no claims exist for that date.
 * Removes: Bills rows for date, BillMeta row for date, Drive image file (if any).
 */
function deleteBill(body) {
  var dateStr = formatDate(body.date);
  if (!dateStr) throw new Error('Invalid date');

  var ss = getSpreadsheet();
  var claimsSheet = ss.getSheetByName(SHEETS.CLAIMS);
  var billsSheet = ss.getSheetByName(SHEETS.BILLS);
  var metaSheet = ss.getSheetByName(SHEETS.BILL_META);
  if (!billsSheet || !metaSheet) throw new Error('Sheets not found');

  var claims = getClaimsForDate(dateStr);
  if (claims && claims.length > 0) {
    throw new Error('Cannot delete bill: some items are still claimed. Remove all claims first.');
  }

  var meta = getBillMetaForDate(dateStr);
  var fileId = normalizeDriveFileId(meta.billImageId);
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      file.setTrashed(true);
    } catch (e) {
      // File may already be deleted or inaccessible
    }
  }

  var billsData = billsSheet.getDataRange().getValues();
  var header = billsData[0];
  var dateCol = header.indexOf('Date');
  if (dateCol < 0) throw new Error('Bills sheet missing Date column');
  var rowsToDelete = [];
  for (var i = 1; i < billsData.length; i++) {
    if (formatDate(billsData[i][dateCol]) === dateStr) {
      rowsToDelete.push(i + 1);
    }
  }
  for (var d = rowsToDelete.length - 1; d >= 0; d--) {
    billsSheet.deleteRow(rowsToDelete[d]);
  }

  var metaData = metaSheet.getDataRange().getValues();
  var metaHeader = metaData[0];
  var metaDateCol = metaHeader.indexOf('Date');
  if (metaDateCol >= 0) {
    for (var j = metaData.length - 1; j >= 1; j--) {
      if (formatDate(metaData[j][metaDateCol]) === dateStr) {
        metaSheet.deleteRow(j + 1);
        break;
      }
    }
  }

  return { ok: true };
}
