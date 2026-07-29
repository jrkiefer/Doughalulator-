/**
 * Hot Tomato Dough Log — Google Apps Script.
 *
 * Phase 5 setup (walked through with the owner):
 *   1. Create a blank Google Sheet.
 *   2. Extensions → Apps Script, paste this whole file, set SECRET below.
 *   3. Run setup() once (authorize when asked).
 *   4. Deploy → New deployment → Web app → execute as Me, access: Anyone.
 *   5. Paste the web-app URL + secret into the app's Settings screen.
 *
 * The app POSTs JSON as text/plain (no CORS preflight). Every payload and
 * every GET carries the shared secret. Saves are merge-upserts by Date:
 * only the columns present in the payload are written — a 2 PM save never
 * blanks EON columns and vice versa.
 */

var SECRET = 'PASTE-YOUR-SECRET-HERE';

var SHEET_NAME = 'Hot Tomato Dough Log';

/** Every data tab and its exact header row. Date is always column A. */
var TABS = {
  'Summary': ['Date', 'Bible Used', 'Forecast Tonight $', 'Current Sales $', 'Sales Left $', 'Forecast Tomorrow $', 'Total Trays To Make', 'Exact Batches', 'Chosen (Up/Down)', 'Batches Made', 'Shortage?'],
  'Dough Count': ['Date', 'Indi Trays', 'Indi Singles', 'Indi Have', 'Small Trays', 'Small Singles', 'Small Have', 'Large Trays', 'Large Singles', 'Large Have', 'Sic Have', 'Boil Trays', 'Boil Singles', 'Boil Have'],
  'Sales': ['Date', 'Forecast Tonight (entered)', 'Forecast Tonight $', 'Current Sales (entered)', 'Current Sales $', 'Sales Left $', 'Forecast Tomorrow (entered)', 'Forecast Tomorrow $', 'Bible Used', 'Bible Row Matched Tonight', 'Bible Row Matched Tomorrow'],
  'Use Tonight': ['Date', 'Indi', 'Small', 'Large', 'Sic'],
  'Left': ['Date', 'Indi', 'Small', 'Large', 'Sic', 'Shortages'],
  'Need Tomorrow': ['Date', 'Indi', 'Small', 'Large', 'Sic'],
  'Make': ['Date', 'Indi Balls', 'Indi Trays', 'Small Balls', 'Small Trays', 'Large Balls', 'Large Trays', 'Sic Balls', 'Sic Trays', 'Boil Trays'],
  'Batches': ['Date', 'Total Trays', 'Batches', 'Rounded (Up/Down)', 'Indi', 'Small', 'Large', 'Sic', 'Boil'],
  'Final Dough': ['Date', 'Indi Trays', 'Indi Singles', 'Indi Final', 'Small Trays', 'Small Singles', 'Small Final', 'Large Trays', 'Large Singles', 'Large Final', 'Sic Final', 'Boil Trays', 'Boil Singles', 'Boil Final'],
  'EON Count': ['Date', 'Indi Trays', 'Indi Singles', 'Indi Have', 'Small Trays', 'Small Singles', 'Small Have', 'Large Trays', 'Large Singles', 'Large Have', 'Sic Have', 'Boil Trays', 'Boil Singles', 'Boil Have', 'Final Sales (entered)', 'Final Sales $'],
  'EON Check': ['Date', 'Indi', 'Small', 'Large', 'Sic', 'Trays Short'],
  'Actual Use': ['Date', 'AM Sales $', 'AM Indi', 'AM Small', 'AM Large', 'AM Sic', 'AM Boil', 'PM Sales $', 'PM Indi', 'PM Small', 'PM Large', 'PM Sic', 'PM Boil'],
};

/** Read-only mirrors of the app's bible JSON, rewritten only when the content hash changes. */
var BIBLE_TABS = { dough: 'Dough Bible', peach: 'Peach Bible' };

/** Columns whose warning text / negatives render red. */
var RED_COLUMNS = {
  'Left': ['Shortages'],
  'EON Check': ['Indi', 'Small', 'Large', 'Sic', 'Trays Short'],
  'Actual Use': ['AM Indi', 'AM Small', 'AM Large', 'AM Sic', 'AM Boil', 'PM Indi', 'PM Small', 'PM Large', 'PM Sic', 'PM Boil'],
};

/** Safe to re-run any time: creates whatever is missing, never touches existing data rows. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getName().indexOf('Untitled') === 0) ss.rename(SHEET_NAME);

  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = TABS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
    var red = RED_COLUMNS[name] || [];
    red.forEach(function (col) {
      var idx = headers.indexOf(col) + 1;
      if (idx > 0) applyRedRule(sheet, idx);
    });
  });

  Object.keys(BIBLE_TABS).forEach(function (key) {
    var name = BIBLE_TABS[key];
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });

  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0) ss.deleteSheet(starter);
}

/** Red font on negative numbers and any warning text in one column. */
function applyRedRule(sheet, colIndex) {
  var range = sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1);
  var rules = sheet.getConditionalFormatRules().filter(function (r) {
    var rr = r.getRanges();
    return !(rr.length === 1 && rr[0].getColumn() === colIndex && rr[0].getRow() === 2);
  });
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR(AND(ISNUMBER(INDIRECT("RC",FALSE)),INDIRECT("RC",FALSE)<0),AND(ISTEXT(INDIRECT("RC",FALSE)),INDIRECT("RC",FALSE)<>""))')
      .setFontColor('#A33E2A')
      .setRanges([range])
      .build(),
  );
  sheet.setConditionalFormatRules(rules);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

    if (body.type === 'day' || body.type === 'eon') {
      (body.tabs || []).forEach(function (write) {
        upsertRow(write.tab, write.row);
      });
      return jsonOut({ ok: true, saved: body.type, date: body.date });
    }
    if (body.type === 'bibles') {
      return jsonOut(writeBibles(body));
    }
    return jsonOut({ ok: false, error: 'unknown type: ' + body.type });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** Merge-upsert one row into a tab by Date: writes only the provided columns. */
function upsertRow(tabName, row) {
  if (!TABS[tabName]) throw new Error('unknown tab: ' + tabName);
  var sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) throw new Error('missing tab (run setup): ' + tabName);
  var headers = TABS[tabName];
  var date = String(row.Date);

  var rowIndex = findDateRow(sheet, date);
  if (rowIndex === -1) {
    rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, 1).setValue(date);
  }
  Object.keys(row).forEach(function (key) {
    if (key === 'Date') return;
    var col = headers.indexOf(key) + 1;
    if (col > 0) sheet.getRange(rowIndex, col).setValue(row[key]);
  });
}

/** Find the sheet row holding a YYYY-MM-DD date in column A, or -1. */
function findDateRow(sheet, date) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var values = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === date) return i + 2;
  }
  return -1;
}

/** Rewrite the two read-only bible tabs, but only when the content hash changed. */
function writeBibles(payload) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('bibleHash') === payload.hash) {
    return { ok: true, bibles: 'unchanged' };
  }
  var ss = SpreadsheetApp.getActive();
  Object.keys(BIBLE_TABS).forEach(function (key) {
    var table = payload.bibles[key];
    var sheet = ss.getSheetByName(BIBLE_TABS[key]) || ss.insertSheet(BIBLE_TABS[key]);
    sheet.clear();
    var meta = [[table.name], ['Season: ' + table.season], [table.notes], ['']];
    sheet.getRange(1, 1, meta.length, 1).setValues(meta);
    sheet.getRange(1, 1).setFontWeight('bold');
    var header = ['Sales', 'Indi', 'Small', 'Large', 'Sic'];
    sheet.getRange(5, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    if (table.rows.length) {
      sheet.getRange(6, 1, table.rows.length, header.length).setValues(table.rows);
    }
  });
  props.setProperty('bibleHash', payload.hash);
  return { ok: true, bibles: 'updated' };
}

function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

    if (p.action === 'ping') {
      return jsonOut({ ok: true, sheet: 'dough', time: new Date().toISOString() });
    }
    if (p.action === 'date') {
      return jsonOut({ ok: true, date: p.date, tabs: readDate(p.date) });
    }
    if (p.action === 'range') {
      var dates = allDates().filter(function (d) { return d >= p.from && d <= p.to; });
      return jsonOut({ ok: true, dates: readMany(dates) });
    }
    if (p.action === 'recent') {
      var n = Math.max(1, Math.min(60, Number(p.n) || 7));
      var recent = allDates().slice(-n);
      return jsonOut({ ok: true, dates: readMany(recent) });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + p.action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** One date's row from every data tab, keyed by header. Missing tabs/rows → null. */
function readDate(date) {
  var ss = SpreadsheetApp.getActive();
  var out = {};
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { out[name] = null; return; }
    var rowIndex = findDateRow(sheet, date);
    if (rowIndex === -1) { out[name] = null; return; }
    var headers = TABS[name];
    var values = sheet.getRange(rowIndex, 1, 1, headers.length).getDisplayValues()[0];
    var row = {};
    headers.forEach(function (h, i) { row[h] = values[i]; });
    out[name] = row;
  });
  return out;
}

function readMany(dates) {
  var out = {};
  dates.forEach(function (d) { out[d] = readDate(d); });
  return out;
}

/** Every date present in Summary or EON Count, ascending. */
function allDates() {
  var ss = SpreadsheetApp.getActive();
  var seen = {};
  ['Summary', 'EON Count'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
      if (r[0]) seen[r[0]] = true;
    });
  });
  return Object.keys(seen).sort();
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
