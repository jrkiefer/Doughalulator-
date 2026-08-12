/**
 * Hot Tomato Dough Log — Google Apps Script.
 *
 * Setup: paste into the sheet's Apps Script editor, run setup() once, deploy
 * as a web app (execute as Me, access: Anyone), then give the app that URL in
 * Settings. There is no password to set.
 *
 * THERE IS NO KEY. Anyone holding the /exec address can read this notebook or
 * write to it, which is the owner's deliberate choice for simplicity. Because
 * of that, nothing destructive is reachable over the web: erasing the log is a
 * menu item inside the spreadsheet, where being signed in is the protection.
 *
 * THE SHAPE OF THIS SHEET
 * The app is the only calculator. It works out every number from the counts
 * the owner types and writes each one into its tab here, so this sheet holds
 * a plain record with no formulas to break:
 *
 *   the 2 PM save  -> 2PM Dough Count, Look up Dough Use for PM / Tomorrow,
 *                     Dough Make (estimate), Final Make Amount,
 *                     Estimated Dough After Gang, AM Dough Use
 *   the EON save   -> EON Dough Count, PM Dough Use, and tonight's row on the
 *                     matching New Bieblerb tab
 *
 * The one exception is the new-bible suggestion: after each EON save the
 * script fits a line through every night recorded on those tabs and rewrites
 * the suggested column, because that needs the whole history rather than one
 * night's numbers.
 *
 * Correcting a number by hand stays corrected until the app saves that date
 * again; pull it back with LOAD FROM SHEET to recalculate from it.
 *
 * Saves are merge-upserts by Date and run under a script lock, so two phones
 * saving in the same second can never race into duplicate rows.
 */

var SHEET_NAME = 'Hot Tomato Dough Log';

// ----- tab names -----

var T_IN = '2PM Dough Count';
var T_EON = 'EON Dough Count';
// Google truncates a tab name at 31 characters. The two "look up" names used
// to be long enough to truncate to the SAME 31 characters, so the second tab
// silently ended up called Sheet2 and everything written to it vanished.
// These are kept short and unmistakably different for that reason.
var NAME_LIMIT = 31;
var T_PM = 'Look up Dough Use for PM';
var T_TOM = 'Look up Dough Use Tomorrow';
var T_MAKE = 'Dough Make (estimate)';
var T_FINAL = 'Final Make Amount';
var T_AFTER = 'Estimated Dough After Gang';
var T_AM = 'AM Dough Use';
var T_PM_USE = 'PM Dough Use';
var BIBLE_TABS = { dough: 'Dough Bible', peach: 'Peach Bible' };
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
TABS[T_MAKE] = ['Date', 'Indi Trays', 'Small Trays', 'Large Trays', 'Sic (balls)', 'Boli Trays',
  'Batch Rounding', 'Trays Total', 'Batches'];
TABS[T_FINAL] = ['Date', 'Indi Trays', 'Small Trays', 'Large Trays', 'Sic (balls)', 'Boli Trays'];
TABS[T_AFTER] = ['Date', 'Indi', 'Small', 'Large', 'Sic', 'Boli'];
TABS[T_EON] = ['Date', 'EON Sales', 'EON Indi Count', 'EON Small Count', 'EON Large Count',
  'EON Sic Count'];
TABS[T_AM] = ['Date', 'AM Sales $', 'AM Indi Use', 'AM Small Use', 'AM Large Use', 'AM Sic Use',
  'Bible Used'];
TABS[T_PM_USE] = ['Date', 'PM Sales $', 'PM Indi Use', 'PM Small Use', 'PM Large Use', 'PM Sic Use',
  'Bible Used'];

/**
 * The self-building bible tabs. Columns A-F accumulate one row per night (the
 * app writes them); the blocks from H on hold the current thresholds beside a
 * freshly fitted suggestion, recomputed from that history after every EON save.
 */
// Keyed to match BIBLE_TABS, so each builder can find its own bible mirror.
var BIBLE_BUILD_TABS = { dough: 'New Bieblerb', peach: 'New Peach Bieblerb' };
var BIBLE_BUILD_HEADERS = ['Date', 'Total Sales', 'Indi', 'Small', 'Large', 'Sic', '',
  'X Sales', 'Old Indi', 'New Indi', '',
  'X Sales ', 'Old Small', 'New Small', '',
  'X Sales', 'Old Large ', 'New Large', '',
  'X Sales', 'Old Sic', 'New Sic'];
/** Column (1-based) where each size's threshold block starts. */
var BIBLE_BUILD_BLOCK = { indi: 8, small: 12, large: 16, sic: 20 };
/** Column holding each size's nightly total use, in A-F. */
var BIBLE_BUILD_USE = { indi: 3, small: 4, large: 5, sic: 6 };

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
    writeHeaders(makeTab(ss, name), TABS[name]);
  });
  Object.keys(BIBLE_TABS).forEach(function (key) {
    makeTab(ss, BIBLE_TABS[key]);
  });
  Object.keys(BIBLE_BUILD_TABS).forEach(function (key) {
    writeHeaders(makeTab(ss, BIBLE_BUILD_TABS[key]), BIBLE_BUILD_HEADERS);
  });

  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0) ss.deleteSheet(starter);
}

/**
 * Fetch or create a tab, and refuse to continue if Google did not give it the
 * name asked for. A name past the 31-character limit is silently replaced with
 * something like "Sheet2", and every later read and write to it disappears —
 * which is exactly how the previous build broke.
 */
function makeTab(ss, name) {
  if (name.length > NAME_LIMIT) {
    throw new Error('tab name too long for Google (' + name.length + ' chars): ' + name);
  }
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (sheet.getName() !== name) {
      throw new Error('Google renamed the tab to "' + sheet.getName() + '" instead of "' + name + '"');
    }
  }
  return sheet;
}

function writeHeaders(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
}

/** Custom menu so the owner can re-run maintenance without touching code. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dough Tools')
    .addItem('Re-run setup', 'setup')
    .addItem('Refresh new-bible suggestions', 'refreshBibleBuilds')
    .addItem('Remove retired tabs', 'removeRetiredTabs')
    .addItem('Erase all data', 'eraseAllData')
    .addToUi();
}

/** Erase every data row, after asking twice. Menu-only — never over the web. */
function eraseAllData() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    'Erase all data?',
    'This clears every recorded day from this notebook. The headings and the ' +
      'bible pages stay. This cannot be undone.',
    ui.ButtonSet.YES_NO,
  );
  if (answer !== ui.Button.YES) return;
  var wiped = wipeAllData();
  ui.alert('Erased ' + wiped + ' rows.');
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

    if (body.type === 'day' || body.type === 'eon') {
      var problem = validateSave(body);
      if (problem) return jsonOut({ ok: false, error: problem });
      (body.tabs || []).forEach(function (write) {
        upsertRow(write.tab, write.row);
      });
      // A finished night changes the history the suggestion is fitted from.
      if (body.type === 'eon') refreshBibleBuilds();
      return jsonOut({ ok: true, saved: body.type, date: normalizeDate(body.date) });
    }
    if (body.type === 'bibles') {
      return jsonOut(writeBibles(body));
    }
    // Erasing is deliberately NOT reachable here: with no key it would be a
    // delete-everything button on the open internet. It lives in the menu.
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
    if (!TABS[write.tab] && !isBibleBuildTab(write.tab)) return 'unknown tab: ' + write.tab;
    if (!write.row || !normalizeDate(write.row.Date)) {
      return 'row missing a valid Date in tab ' + write.tab;
    }
    var keys = Object.keys(write.row);
    var columns = headersFor(write.tab);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (key === 'Date') continue;
      // upsertRow drops a column it cannot find, in silence. Left unchecked, a
      // heading renamed on one side only would simply stop recording numbers
      // with nothing to show for it - the same quiet failure that the
      // 31-character tab-name collision once cost a whole rebuild.
      if (columns.indexOf(key) === -1) {
        return 'unknown column: ' + write.tab + ' -> ' + key;
      }
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

function isBibleBuildTab(name) {
  return Object.keys(BIBLE_BUILD_TABS).some(function (k) { return BIBLE_BUILD_TABS[k] === name; });
}

/** The headings a tab is written against. */
function headersFor(tabName) {
  // The bible-building tabs are written only in their left-hand history block;
  // the suggestion blocks to the right belong to refreshBibleBuild().
  return isBibleBuildTab(tabName) ? BIBLE_BUILD_HEADERS.slice(0, 6) : TABS[tabName];
}

/**
 * Merge-upsert one row into a tab by Date. Only the provided columns
 * change (blank = clear): the tab's data block is read ONCE - which yields
 * both the matching row's position and its current values - the payload's
 * columns are overlaid, and the row goes back in ONE ranged write.
 */
function upsertRow(tabName, row) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) throw new Error('missing tab (run setup): ' + tabName);
  var headers = headersFor(tabName);
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
 * Erase every data row. Headings and the bible mirrors survive. Reached from
 * the menu only, never from the web.
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
 * Mirror the app's two bible tables into their read-only tabs, in the owner's
 * format: headings on row 1, thresholds from row 2. Skipped when the content
 * hash is unchanged, so a save almost never pays for this.
 */
function writeBibles(payload) {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActive();
  var header = ['Threshold', 'Indi', 'Small', 'Large', 'Sicilian'];
  // The remembered hash is only trustworthy while the mirrors still HOLD what
  // it describes: after a wipe they are empty but the memory survives, which
  // once left the bible tabs blank with the script insisting all was well.
  var mirrored = Object.keys(BIBLE_TABS).every(function (key) {
    var sheet = ss.getSheetByName(BIBLE_TABS[key]);
    return sheet && sheet.getLastRow() > 1;
  });
  if (mirrored && props.getProperty('bibleHash') === payload.hash) {
    return { ok: true, bibles: 'unchanged' };
  }
  Object.keys(BIBLE_TABS).forEach(function (key) {
    var table = payload.bibles[key];
    var sheet = makeTab(ss, BIBLE_TABS[key]);
    sheet.clear();
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (table.rows.length) {
      sheet.getRange(2, 1, table.rows.length, header.length).setValues(table.rows);
    }
  });
  props.setProperty('bibleHash', payload.hash);
  return { ok: true, bibles: 'updated' };
}

// ----- the self-building bible -----

/**
 * Refresh the suggestion columns on both bible-building tabs. The app has
 * already added tonight's row to columns A-F; this fits a line through all the
 * nights recorded there and writes what each bible threshold WOULD say, beside
 * what it says today. Runs after every EON save, so the suggestion keeps
 * sharpening on its own as nights accumulate.
 *
 * This is the one sum the sheet does rather than the app: it needs the whole
 * recorded history, which the app would otherwise have to re-download on every
 * single save.
 */
function refreshBibleBuilds() {
  Object.keys(BIBLE_BUILD_TABS).forEach(function (key) {
    refreshBibleBuild(key);
  });
}

function refreshBibleBuild(key) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(BIBLE_BUILD_TABS[key]);
  var mirror = ss.getSheetByName(BIBLE_TABS[key]);
  if (!sheet || !mirror || mirror.getLastRow() < 2) return;

  // Every night recorded on this bible: sales against total use, per size.
  var last = sheet.getLastRow();
  var history = last >= 2 ? sheet.getRange(2, 1, last - 1, 6).getValues() : [];
  var thresholds = mirror.getRange(2, 1, mirror.getLastRow() - 1, 5).getValues();

  Object.keys(BIBLE_BUILD_BLOCK).forEach(function (size, sizeIndex) {
    var points = [];
    history.forEach(function (row) {
      var sales = Number(row[1]);
      var use = Number(row[BIBLE_BUILD_USE[size] - 1]);
      if (row[1] !== '' && row[BIBLE_BUILD_USE[size] - 1] !== '' && isFinite(sales) && isFinite(use)) {
        points.push([sales, use]);
      }
    });
    // Under three nights any line is noise, so the column stays blank.
    var fit = points.length >= 3 ? theilSen(points) : null;
    var block = thresholds.map(function (row) {
      var sales = Number(row[0]);
      var current = row[sizeIndex + 1];
      var suggested = fit ? Math.max(0, Math.round(fit.slope * sales + fit.intercept)) : '';
      return [sales, current, suggested];
    });
    if (block.length) {
      ensureRows(sheet, block.length + 1);
      sheet.getRange(2, BIBLE_BUILD_BLOCK[size], block.length, 3).setValues(block);
    }
  });
}

/** Median-of-pairwise-slopes fit - one wild night can't drag the line. */
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

// ----- read path -----

function doGet(e) {
  try {
    var p = e.parameter || {};

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
