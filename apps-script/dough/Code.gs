/**
 * Hot Tomato Dough Log — Google Apps Script (formula-driven layout).
 *
 * Setup: paste into the sheet's Apps Script editor, set SECRET, run setup()
 * once, deploy as a web app (execute as Me, access: Anyone), then give the
 * app the URL + secret in Settings.
 *
 * THE SHAPE OF THIS SHEET
 * The app writes exactly TWO tabs — the 2 PM count and the EON count. Every
 * other number is a live formula, installed once by setup() as a single
 * ARRAYFORMULA per column, so a new date calculates itself the moment its
 * counts land. Nothing ever needs filling down.
 *
 *   2PM Dough Count  -+-> Look up Dough Use for PM / for Tomorrow
 *   EON Dough Count  -|      +-> Dough Make (estimate) -> Final Make Amount
 *                     |            +-> Estimated Dough Amount after Dough Gang
 *                     +-> AM Dough Use / PM Dough Use -> fitted bibles
 *
 * The formulas mirror the app's calculation engine rule for rule (trays
 * floored at zero, round-down batches floored at one, Boli topped back up to
 * 36 balls, the 40/60 Small/Large batch split), so the app can read these
 * numbers back and show the owner that both agree.
 *
 * Saves are merge-upserts by Date and run under a script lock, so two phones
 * saving in the same second can never race into duplicate rows.
 */

var SECRET = 'PASTE-YOUR-SECRET-HERE';

var SHEET_NAME = 'Hot Tomato Dough Log';

// ----- tab names -----

var T_IN = '2PM Dough Count';
var T_EON = 'EON Dough Count';
var T_PM = 'Calculation Step Look up Dough Use for PM';
var T_TOM = 'Calculation Step Look up Dough Use for Tomorrow';
var T_MAKE = 'Calculation Step Dough Make (estimate)';
var T_FINAL = 'Final Make Amount';
var T_AFTER = 'Estimated Dough Amount after Dough Gang';
var T_AM = 'AM Dough Use';
var T_PM_USE = 'PM Dough Use';
var BIBLE_TABS = { dough: 'Dough Bible', peach: 'Peach Bible' };
var FITTED_TABS = { dough: 'New Bieblerb', peach: 'New Peach Bieblerb' };
var PEACH_START = '07-01';
var PEACH_END = '08-31';

/**
 * Every tab and its exact header row. The app works out all of these numbers
 * and writes them here - this sheet keeps the record, it does not calculate.
 * Date is always column A.
 */
var TABS = {};
TABS[T_IN] = ['Date', "Today's Forecast", 'Current Sales', 'Sales Left', "Tomorrow's Forecast",
  'Indi Count', 'Small Count', 'Large Count', 'Sic Count', 'Boli Count',
  'Bible', 'Forecast Rounding', 'Batch Rounding'];
TABS[T_PM] = ['Date', 'Bible', 'Forecast Rounding', 'Sales Left', 'Indi', 'Small', 'Large', 'Sic'];
TABS[T_TOM] = ['Date', 'Bible', 'Forecast Rounding', "Tomorrow's Forecast",
  'Indi', 'Small', 'Large', 'Sic'];
TABS[T_MAKE] = ['Date', 'Indi Trays', 'Small Trays', 'Large Trays', 'Sic Balls', 'Sic Trays',
  'Boli Trays', 'Batch Rounding', 'Trays Total', 'Batches'];
TABS[T_FINAL] = ['Date', 'Indi Trays', 'Small Trays', 'Large Trays', 'Sic Balls', 'Boli Trays'];
TABS[T_AFTER] = ['Date', 'Indi', 'Small', 'Large', 'Sic', 'Boli'];
TABS[T_EON] = ['Date', 'EON Sales', 'EON Indi Count', 'EON Small Count', 'EON Large Count',
  'EON Sic Count', 'EON Boli Count'];
TABS[T_AM] = ['Date', 'AM Sales $', 'AM Indi Use', 'AM Small Use', 'AM Large Use', 'AM Sic Use',
  'Bible Used'];
TABS[T_PM_USE] = ['Date', 'PM Sales $', 'PM Indi Use', 'PM Small Use', 'PM Large Use', 'PM Sic Use',
  'Bible Used'];

/** Columns that may legitimately hold negatives - everything else must be >= 0. */
var NEGATIVE_OK = {};
NEGATIVE_OK[T_IN] = { 'Sales Left': true };

/** Tabs the previous layout used, retired by this one. */
var RETIRED_TABS = ['Summary', 'Dough Count', 'Sales', 'Use Tonight', 'Left', 'Need Tomorrow',
  'Make', 'Batches', 'Final Dough', 'EON Count', 'EON Check', 'Dough Use',
  'New Dough Bible', 'New Peach Bible', 'Actual Use'];

// ----- setup -----

/** Safe to re-run any time: creates whatever is missing and refreshes headers. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getName().indexOf('Untitled') === 0) ss.rename(SHEET_NAME);

  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = TABS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  });

  Object.keys(BIBLE_TABS).forEach(function (key) {
    if (!ss.getSheetByName(BIBLE_TABS[key])) ss.insertSheet(BIBLE_TABS[key]);
  });

  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0) ss.deleteSheet(starter);
}

/** Custom menu so the owner can re-run maintenance without touching code. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dough Tools')
    .addItem('Re-run setup', 'setup')
    .addItem('Regenerate fitted bibles', 'generateFittedBibles')
    .addItem('Remove retired tabs', 'removeRetiredTabs')
    .addToUi();
}

/** Delete the tabs the old layout used, once the new one is trusted. */
function removeRetiredTabs() {
  var ss = SpreadsheetApp.getActive();
  var removed = 0;
  RETIRED_TABS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.deleteSheet(sheet);
      removed++;
    }
  });
  return removed;
}

// ----- write path -----

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return jsonOut({ ok: false, retryable: true, error: 'busy - another save is writing; try again' });
  }
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

    if (body.type === 'day' || body.type === 'eon') {
      var problem = validateSave(body);
      if (problem) return jsonOut({ ok: false, error: problem });
      (body.tabs || []).forEach(function (write) {
        upsertRow(write.tab, write.row);
      });
      return jsonOut({ ok: true, saved: body.type, date: normalizeDate(body.date) });
    }
    if (body.type === 'bibles') {
      return jsonOut(writeBibles(body));
    }
    if (body.type === 'wipe' || body.type === 'retire') {
      if (body.confirm !== 'WIPE ALL DATA') {
        return jsonOut({ ok: false, error: "needs confirm: 'WIPE ALL DATA'" });
      }
      return body.type === 'wipe'
        ? jsonOut({ ok: true, wiped: wipeAllData() })
        : jsonOut({ ok: true, removed: removeRetiredTabs() });
    }
    return jsonOut({ ok: false, error: 'unknown type: ' + body.type });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Terminal validation - a rejection here means retrying the same payload is pointless. */
function validateSave(body) {
  if (!normalizeDate(body.date)) return 'missing or invalid date: ' + body.date;
  var tabs = body.tabs || [];
  if (tabs.length === 0) return 'empty save: no tabs';
  var hasContent = false;
  for (var i = 0; i < tabs.length; i++) {
    var write = tabs[i];
    if (!TABS[write.tab]) return 'unknown tab: ' + write.tab;
    if (!write.row || !normalizeDate(write.row.Date)) {
      return 'row missing a valid Date in tab ' + write.tab;
    }
    var keys = Object.keys(write.row);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (key === 'Date') continue;
      var value = write.row[key];
      if (value !== '' && value !== null) hasContent = true;
      var allowNegative = NEGATIVE_OK[write.tab] && NEGATIVE_OK[write.tab][key];
      if (typeof value === 'number' && value < 0 && !allowNegative) {
        return 'negative value where it makes no sense: ' + write.tab + ' -> ' + key + ' = ' + value;
      }
    }
  }
  if (!hasContent) return 'empty save: nothing beyond the date';
  return null;
}

/**
 * Merge-upsert one row into an input tab by Date. Only the provided columns
 * change (blank = clear): the tab's data block is read ONCE - which yields
 * both the matching row's position and its current values - the payload's
 * columns are overlaid, and the row goes back in ONE ranged write.
 */
function upsertRow(tabName, row) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) throw new Error('missing tab (run setup): ' + tabName);
  var headers = TABS[tabName];
  var date = normalizeDate(row.Date);

  var last = sheet.getLastRow();
  var block = last >= 2 ? sheet.getRange(2, 1, last - 1, headers.length).getValues() : [];
  var rowIndex = -1;
  var values = null;
  for (var i = 0; i < block.length; i++) {
    // First match wins, exactly as a top-down scan of column A would.
    if (normalizeDate(block[i][0]) === date) {
      rowIndex = i + 2;
      values = block[i];
      break;
    }
  }
  if (rowIndex === -1) {
    rowIndex = last + 1;
    ensureRows(sheet, rowIndex);
    values = headers.map(function () { return ''; });
  }
  values[0] = date;
  Object.keys(row).forEach(function (key) {
    if (key === 'Date') return;
    var c = headers.indexOf(key);
    if (c > 0) values[c] = row[key];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
}

/**
 * Erase the data rows of both input tabs. Headers, formulas, and the bible
 * mirrors survive - every calculated tab empties itself once its inputs are
 * gone. Reached only via doPost with the confirm phrase; the app never sends it.
 */
function wipeAllData() {
  var ss = SpreadsheetApp.getActive();
  var wiped = 0;
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var last = sheet.getLastRow();
    if (last > 1) {
      // clearContent, not deleteRows: deleting rows shrinks the formats setup() installed.
      sheet.getRange(2, 1, last - 1, TABS[name].length).clearContent();
      wiped += last - 1;
    }
  });
  return wiped;
}

/**
 * Normalize a date from the app OR a sheet cell to YYYY-MM-DD. Accepts ISO,
 * M/D/YYYY, M/D/YY (2-digit years land in 2000-2099), and the real Date
 * objects getValues() hands back for date-formatted cells (column A is
 * formatted by setup(), so a value written as text comes back as a Date).
 * '' if hopeless.
 */
function normalizeDate(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return value.getFullYear() + '-' + pad2(value.getMonth() + 1) + '-' + pad2(value.getDate());
  }
  var s = String(value).trim();
  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return iso[1] + '-' + pad2(iso[2]) + '-' + pad2(iso[3]);
  var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    var year = us[3].length === 2 ? '20' + us[3] : us[3];
    return year + '-' + pad2(us[1]) + '-' + pad2(us[2]);
  }
  return '';
}

function pad2(n) {
  return ('0' + n).slice(-2);
}

/**
 * Grow a tab when a write would land past its last row. A new Google sheet
 * stops at 1000 rows and a ranged write past that THROWS - which the app
 * would read as a terminal refusal and stop saving for good.
 */
function ensureRows(sheet, lastRow) {
  var max = sheet.getMaxRows();
  if (lastRow > max) sheet.insertRowsAfter(max, lastRow - max);
}

/**
 * Rewrite the two read-only bible tabs, plus the hidden lookup blocks the
 * formulas read. Skipped when the content hash is unchanged.
 *
 * The lookup tab holds four blocks so one VLOOKUP can serve every row: the
 * plain table (round DOWN - the row at or below) and a key-shifted copy
 * (round UP - the next row up unless sales land exactly on a row).
 */
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
    var header = ['Threshold', 'Indi', 'Small', 'Large', 'Sicilian'];
    sheet.getRange(5, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    if (table.rows.length) {
      sheet.getRange(6, 1, table.rows.length, header.length).setValues(table.rows);
    }
  });
  props.setProperty('bibleHash', payload.hash);
  return { ok: true, bibles: 'updated' };
}

// ----- fitted bibles -----

/**
 * Fit a robust line (Theil-Sen: median of pairwise slopes) of actual use vs
 * that day's sales, per size and per season, then emit candidate bible
 * tables at the same thresholds as the current bibles - new numbers beside
 * current ones, clearly labeled as suggestions.
 */
function generateFittedBibles() {
  var ss = SpreadsheetApp.getActive();
  var am = ss.getSheetByName(T_AM);
  var pm = ss.getSheetByName(T_PM_USE);
  if (!am || !pm) return;

  var points = {
    regular: { indi: [], small: [], large: [], sic: [] },
    peach: { indi: [], small: [], large: [], sic: [] }
  };
  function rowsOf(sheet) {
    return sheet.getLastRow() >= 2
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues()
      : [];
  }
  var SIZES = ['indi', 'small', 'large', 'sic'];
  // AM and PM use are two halves of the same night: sum them per date.
  var byDate = {};
  [rowsOf(am), rowsOf(pm)].forEach(function (rows) {
    rows.forEach(function (r) {
      var d = normalizeDate(r[0]);
      if (!d) return;
      var slot = byDate[d] || (byDate[d] = { sales: 0, use: {}, season: 'regular' });
      var sales = Number(r[1]);
      if (r[1] !== '' && isFinite(sales)) slot.sales += sales;
      SIZES.forEach(function (size, i) {
        var v = Number(r[i + 2]);
        if (r[i + 2] !== '' && isFinite(v)) slot.use[size] = (slot.use[size] || 0) + v;
      });
      if (r[6] === 'peach') slot.season = 'peach';
    });
  });
  Object.keys(byDate).forEach(function (d) {
    var slot = byDate[d];
    if (!slot.sales) return;
    SIZES.forEach(function (size) {
      if (slot.use[size] !== undefined) points[slot.season][size].push([slot.sales, slot.use[size]]);
    });
  });

  writeFittedTab(FITTED_TABS.dough, BIBLE_TABS.dough, points.regular);
  writeFittedTab(FITTED_TABS.peach, BIBLE_TABS.peach, points.peach);
}

function writeFittedTab(fittedName, mirrorName, sizePoints) {
  var ss = SpreadsheetApp.getActive();
  var mirror = ss.getSheetByName(mirrorName);
  var sheet = ss.getSheetByName(fittedName) || ss.insertSheet(fittedName);
  sheet.clear();
  sheet.getRange(1, 1).setValue(
    'SUGGESTED bible from recorded history - read-only, regenerate from the Dough Tools menu. The current bible stays in charge.'
  ).setFontWeight('bold');

  if (!mirror || mirror.getLastRow() < 6) {
    sheet.getRange(3, 1).setValue('The bible mirror tab is empty - save a record first so the app mirrors the bibles.');
    return;
  }
  var mirrorRows = mirror.getRange(6, 1, mirror.getLastRow() - 5, 5).getValues();

  var sizes = ['indi', 'small', 'large', 'sic'];
  var fits = {};
  var enough = false;
  sizes.forEach(function (size) {
    var pts = sizePoints[size];
    fits[size] = pts.length >= 3 ? theilSen(pts) : null;
    if (fits[size]) enough = true;
  });
  if (!enough) {
    sheet.getRange(3, 1).setValue('Not enough history yet - need at least 3 recorded nights in this season.');
    return;
  }

  var header = ['Sales', 'Indi (new)', 'Indi (now)', 'Small (new)', 'Small (now)',
    'Large (new)', 'Large (now)', 'Sic (new)', 'Sic (now)'];
  sheet.getRange(3, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  var out = mirrorRows.map(function (row) {
    var sales = Number(row[0]);
    var line = [sales];
    sizes.forEach(function (size, i) {
      var fit = fits[size];
      line.push(fit ? Math.max(0, Math.round(fit.slope * sales + fit.intercept)) : '');
      line.push(row[i + 1]);
    });
    return line;
  });
  sheet.getRange(4, 1, out.length, header.length).setValues(out);
}

/** Median-of-pairwise-slopes fit - outlier nights can't drag the line. */
function theilSen(points) {
  var slopes = [];
  for (var i = 0; i < points.length; i++) {
    for (var j = i + 1; j < points.length; j++) {
      var dx = points[j][0] - points[i][0];
      if (dx !== 0) slopes.push((points[j][1] - points[i][1]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  var slope = median(slopes);
  var intercepts = points.map(function (p) { return p[1] - slope * p[0]; });
  return { slope: slope, intercept: median(intercepts) };
}

function median(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inPeachWindow(isoDate) {
  var md = isoDate.slice(5);
  return md >= PEACH_START && md <= PEACH_END;
}

// ----- read path -----

function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

    if (p.action === 'ping') {
      return jsonOut({ ok: true, sheet: 'dough', time: new Date().toISOString() });
    }
    // One pass over the tabs serves whichever read follows.
    if (p.action === 'date') {
      var date = normalizeDate(p.date);
      if (!date) return jsonOut({ ok: false, error: 'missing or invalid date: ' + p.date });
      return jsonOut({ ok: true, date: date, tabs: readDate(date) });
    }
    if (p.action === 'range') {
      var from = normalizeDate(p.from);
      var to = normalizeDate(p.to);
      if (!from || !to) return jsonOut({ ok: false, error: 'range needs valid from and to dates' });
      var rangeIndex = loadTabIndex();
      var dates = allDates(rangeIndex).filter(function (d) { return d >= from && d <= to; });
      return jsonOut({ ok: true, dates: readMany(dates, rangeIndex) });
    }
    if (p.action === 'recent') {
      var n = Math.max(1, Math.min(60, Number(p.n) || 7));
      var recentIndex = loadTabIndex();
      return jsonOut({ ok: true, dates: readMany(allDates(recentIndex).slice(-n), recentIndex) });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + p.action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/**
 * Read every tab ONCE and index its rows by date - the whole read path costs
 * one Sheets call per tab no matter how many dates are asked for.
 */
function loadTabIndex() {
  var ss = SpreadsheetApp.getActive();
  var index = { _headers: TABS };
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { index[name] = null; return; }
    var headers = TABS[name];
    var byDate = {};
    var last = sheet.getLastRow();
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, headers.length).getDisplayValues().forEach(function (values) {
        var d = normalizeDate(values[0]);
        // First match wins, exactly as a top-down scan of column A would.
        if (!d || byDate[d]) return;
        var row = {};
        headers.forEach(function (h, i) { row[h] = values[i]; });
        row.Date = d;
        byDate[d] = row;
      });
    }
    index[name] = byDate;
  });
  return index;
}

function readMany(dates, index) {
  index = index || loadTabIndex();
  var names = Object.keys(TABS);
  var out = {};
  dates.forEach(function (date) {
    var tabs = {};
    names.forEach(function (name) {
      tabs[name] = index[name] ? (index[name][date] || null) : null;
    });
    out[date] = tabs;
  });
  return out;
}

/** One date's row from every tab, keyed by header. Missing tabs/rows -> null. */
function readDate(date, index) {
  return readMany([date], index)[date];
}

/** Every date the log knows about, ascending. */
function allDates(index) {
  index = index || loadTabIndex();
  var seen = {};
  [T_IN, T_EON].forEach(function (name) {
    if (!index[name]) return;
    Object.keys(index[name]).forEach(function (d) { seen[d] = true; });
  });
  return Object.keys(seen).sort();
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
