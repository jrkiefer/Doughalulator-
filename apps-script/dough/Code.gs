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
 *                     Estimated Dough After Gang
 *   the EON save   -> EON Dough Count
 *
 * The one exception is the self-building bible. After each EON save this
 * script derives every recorded night's dough use from those tabs three ways
 * - the morning (AM Dough Use), the night (PM Dough Use) and the two added
 * (All Day Dough Use) - rewrites those three tabs in full, saying in words
 * what it left out and why, and fits one line through all three kinds of
 * point to rewrite the suggested column on the New Bieblerb tabs. That needs
 * the whole history rather than one night's numbers, which is why it lives
 * here and not in the app.
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
var T_DAY_USE = 'All Day Dough Use';
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
// The three use tabs are the script's own (v1.30.0): rewritten in full after
// every close from the recorded counts. 'Ignored' says, in words, what the
// fit left out of that night and why - blank means every size was used.
TABS[T_AM] = ['Date', 'AM Sales $', 'AM Indi Use', 'AM Small Use', 'AM Large Use', 'AM Sic Use',
  'Bible Used', 'Ignored'];
TABS[T_PM_USE] = ['Date', 'PM Sales $', 'PM Indi Use', 'PM Small Use', 'PM Large Use', 'PM Sic Use',
  'Bible Used', 'Ignored'];
TABS[T_DAY_USE] = ['Date', 'All Day Sales $', 'All Day Indi Use', 'All Day Small Use',
  'All Day Large Use', 'All Day Sic Use', 'Bible Used', 'Ignored'];

/** The three kinds of point the bible is fitted from, and the tab each is recorded on. */
var USE_KINDS = ['am', 'pm', 'day'];
var USE_TABS = { am: T_AM, pm: T_PM_USE, day: T_DAY_USE };
var SIZE_LABEL = { indi: 'Indi', small: 'Small', large: 'Large', sic: 'Sic' };

/**
 * The self-building bible tabs. Columns A-F hold one row per night with
 * takings - the All Day figures, rewritten by the script after every close
 * (older phones still post a row of their own there; it is overwritten). The
 * blocks from H on hold the current thresholds beside a freshly fitted
 * suggestion, and the block from X on says how many points and nights each
 * size's line rests on and how many were left out as outliers.
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
/** Column (1-based) of the per-size stats block, and its headings. */
var BIBLE_BUILD_STATS_COL = 24; // X
var BIBLE_BUILD_STATS_HEADERS = ['Size', 'Points', 'Nights', 'AM', 'PM', 'All Day', 'Ignored'];

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
    throw refuse('tab name too long for Google (' + name.length + ' chars): ' + name);
  }
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (sheet.getName() !== name) {
      throw refuse('Google renamed the tab to "' + sheet.getName() + '" instead of "' + name + '"');
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
    .addItem('Check the log', 'checkLog')
    .addItem('Re-run setup', 'setup')
    .addItem('Refresh new-bible suggestions', 'refreshBibleBuilds')
    .addItem('Remove retired tabs', 'removeRetiredTabs')
    .addItem('Erase all data', 'eraseAllData')
    .addToUi();
}

/**
 * Everything about this notebook that would otherwise go unnoticed, in plain
 * words. Read-only: it writes nothing, changes nothing, adds nothing.
 *
 * The app takes the FIRST row it finds for a date and stops, so a second row
 * for the same day is invisible to it while sitting in plain sight here. Same
 * for a heading that has been moved and a date cell that cannot be read. None
 * of those announce themselves, which is the whole reason this exists.
 */
function logProblems() {
  var ss = SpreadsheetApp.getActive();
  var out = [];
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      out.push('The "' + name + '" page is missing. Run Dough Tools > Re-run setup.');
      return;
    }
    var headers = TABS[name];
    var last = sheet.getLastRow();
    if (last < 1) return;
    var block = sheet.getRange(1, 1, last, headers.length).getValues();

    for (var c = 0; c < headers.length; c++) {
      var found = String(block[0][c] === undefined || block[0][c] === null ? '' : block[0][c]).trim();
      if (found !== headers[c]) {
        out.push('"' + name + '" \u2014 the heading in ' + colLetter(c + 1) + '1 should say "' +
          headers[c] + '" but says "' + found +
          '". Nothing can be saved to this page until it is put back.');
      }
    }

    var seen = {};
    var dupes = {};
    var unreadable = 0;
    for (var r = 1; r < block.length; r++) {
      var raw = block[r][0];
      if (raw === '' || raw === null) continue;
      var d = normalizeDate(raw);
      if (!d) { unreadable++; continue; }
      if (seen[d]) dupes[d] = true;
      seen[d] = true;
    }
    var repeated = Object.keys(dupes).sort();
    if (repeated.length) {
      out.push('"' + name + '" has more than one row for ' + repeated.join(', ') +
        '. The app only ever reads the first one, so the others are invisible to it \u2014 delete them.');
    }
    if (unreadable) {
      out.push('"' + name + '" has ' + unreadable +
        ' row(s) whose date cannot be read. The app skips those.');
    }
  });
  return out;
}

/** Menu item: run the checks and say what they found, in plain words. */
function checkLog() {
  var problems = logProblems();
  var ui = SpreadsheetApp.getUi();
  if (problems.length === 0) {
    ui.alert(
      'All good',
      'Every page has the headings the app expects, every date reads cleanly, and no day appears twice.',
      ui.ButtonSet.OK);
    return;
  }
  ui.alert(
    problems.length === 1 ? 'One thing to look at' : problems.length + ' things to look at',
    problems.join('\n\n'),
    ui.ButtonSet.OK);
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

/**
 * Mark an error as one of OUR OWN refusals — a structural problem the owner
 * can act on (a moved heading, a missing tab, a too-long name). The catch in
 * doPost answers these terminally, in plain words, so the phone TELLS rather
 * than retries. Anything thrown WITHOUT this mark is Google misbehaving
 * mid-request (a transient service error, a quota hiccup) and is answered
 * retryable-shaped instead: the app's backoff ladder handles those far
 * better than a red "SHEET REFUSED" the owner cannot do anything about.
 */
function refuse(message) {
  var err = new Error(message);
  err.plainRefusal = true;
  return err;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return jsonOut({ ok: false, retryable: true, error: 'busy - another save is writing; try again' });
  }
  try {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      // A body that is not JSON can never BECOME JSON by resending it.
      return jsonOut({ ok: false, error: 'unreadable save: ' + String(parseErr) });
    }

    if (body.type === 'day' || body.type === 'eon') {
      var problem = validateSave(body);
      if (problem) return jsonOut({ ok: false, error: problem });
      // Two phases, so a refusal can never leave a HALF-WRITTEN day behind:
      // every tab's block is read and its headings checked first, and only
      // once all of them pass does anything get written. (Before this, a
      // moved heading on the third tab refused the save with the first two
      // already written.) Same total Sheets calls as before - one read and
      // one write per tab - just reordered.
      var prepared = (body.tabs || []).map(function (write) {
        return prepareUpsert(write.tab, write.row);
      });
      prepared.forEach(function (p) {
        if (p) commitUpsert(p);
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
    // Our own guards refuse terminally; everything else is Google's moment.
    if (err && err.plainRefusal) return jsonOut({ ok: false, error: err.message });
    return jsonOut({ ok: false, retryable: true, error: String(err) });
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

/** Spreadsheet column letter for a 1-based index (A, B, ... Z, AA). */
function colLetter(index) {
  var out = '';
  while (index > 0) {
    var rem = (index - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    index = Math.floor((index - 1) / 26);
  }
  return out;
}

/**
 * Refuse to write when the tab's columns are not where the app thinks.
 *
 * Every write maps a column NAME to a POSITION using this script's own header
 * list. Nothing else ever looks at the sheet's real header row, so a column
 * inserted, reordered or renamed by hand would send every value into the wrong
 * cell and report success. Throwing here turns that into a refusal the phone
 * shows in words. Same failure class as the 31-character tab-name collision:
 * a structural mismatch that otherwise fails in silence.
 */
function assertHeaders(tabName, expected, actual) {
  for (var i = 0; i < expected.length; i++) {
    var found = String(actual[i] === undefined || actual[i] === null ? '' : actual[i]).trim();
    if (found !== expected[i]) {
      throw refuse(
        'the "' + tabName + '" tab has moved its columns - ' + colLetter(i + 1) +
        '1 should say "' + expected[i] + '" but says "' + found +
        '". Put that heading back, or run Dough Tools > Re-run setup.');
    }
  }
}

/**
 * Phase 1 of a merge-upsert: read the tab's data block ONCE - which yields
 * the header row, the matching row's position and its current values - check
 * the headings, and work out exactly what the write will be. NOTHING is
 * written here: doPost prepares every tab first so a refusal on any of them
 * can never leave a half-written day behind.
 *
 * The read starts at row 1, not row 2, so the sheet's own headings come along
 * for free and can be checked before anything is written.
 *
 * Returns null for the one write that should not happen at all: a row whose
 * payload cells are ALL blank landing on a date the tab has no row for.
 * Blank cells exist to CLEAR (retract a make that no longer applies), and
 * clearing a row that does not exist would only append date-only clutter.
 */
function prepareUpsert(tabName, row) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) throw refuse('missing tab (run setup): ' + tabName);
  var headers = headersFor(tabName);
  var date = normalizeDate(row.Date);

  var last = sheet.getLastRow();
  var block = last >= 1 ? sheet.getRange(1, 1, last, headers.length).getValues() : [];
  assertHeaders(tabName, headers, block.length ? block[0] : []);

  var rowIndex = -1;
  var values = null;
  // getLastRow() counts content in ANY column, so a stray note far down would
  // push an append past a gap of blank rows. The real end of the data is the
  // last row with a date in column A, which this scan already passes over.
  var lastDated = 1;
  for (var i = 1; i < block.length; i++) {
    if (block[i][0] === '' || block[i][0] === null) continue;
    lastDated = i + 1;
    // First match wins, exactly as a top-down scan of column A would.
    if (rowIndex === -1 && normalizeDate(block[i][0]) === date) {
      rowIndex = i + 1;
      values = block[i];
    }
  }
  if (rowIndex === -1) {
    var anyContent = Object.keys(row).some(function (key) {
      return key !== 'Date' && row[key] !== '' && row[key] !== null;
    });
    if (!anyContent) return null; // all-blank + no existing row: nothing to record
    rowIndex = lastDated + 1;
    values = headers.map(function () { return ''; });
  }
  values[0] = date;
  Object.keys(row).forEach(function (key) {
    if (key === 'Date') return;
    var c = headers.indexOf(key);
    if (c > 0) values[c] = row[key];
  });
  return { sheet: sheet, rowIndex: rowIndex, width: headers.length, values: values };
}

/** Phase 2: the one ranged write a prepared upsert boils down to. */
function commitUpsert(prepared) {
  ensureRows(prepared.sheet, prepared.rowIndex);
  prepared.sheet
    .getRange(prepared.rowIndex, 1, 1, prepared.width)
    .setValues([prepared.values]);
}

/**
 * Erase every data row. Headings and the bible mirrors survive. Reached from
 * the menu only, never from the web. The bible-build tabs are not in TABS,
 * but their history no longer outlives an erase: the next refresh rebuilds
 * it from the emptied log, so "clears every recorded day" stays true.
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
 * The SPREADSHEET's timezone, which is a different setting from the Apps
 * Script project's. Cached per execution - it cannot change mid-request.
 */
var __ssTz = null;
function ssTimeZone() {
  if (!__ssTz) __ssTz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return __ssTz;
}

/**
 * Normalize a date from the app OR a sheet cell to YYYY-MM-DD. Accepts ISO,
 * M/D/YYYY, M/D/YY (2-digit years land in 2000-2099), and the real Date
 * objects getValues() hands back for date-formatted cells (column A is
 * formatted by setup(), so a value written as text comes back as a Date).
 * '' if hopeless.
 *
 * A date-only cell holds MIDNIGHT IN THE SPREADSHEET'S ZONE. Asking the Date
 * object for its own getFullYear/getMonth/getDate answers in the SCRIPT
 * project's zone instead, and when the sheet's zone runs ahead of the
 * script's, that instant is still the previous day there - so the cell reads
 * as the day before. The damage is not a wrong date on screen: the incoming
 * payload's date is a plain STRING (never shifted) while the stored cell is a
 * Date (shifted), so upsertRow stops recognising its own row and appends a
 * fresh one on EVERY save, silently, for ever. Formatting in the sheet's own
 * zone is the fix, and a test pins it.
 */
function normalizeDate(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, ssTimeZone(), 'yyyy-MM-dd');
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
 * Refresh both bible-building tabs: rebuild the A-F history from the recorded
 * tabs, then fit a line through it and write what each bible threshold WOULD
 * say beside what it says today. Runs after every EON save and from the menu.
 *
 * This is the one sum the sheet does rather than the app: it needs the whole
 * recorded history, which the app would otherwise have to re-download on every
 * single save.
 */
function refreshBibleBuilds() {
  var points = rebuildBibleHistories();
  Object.keys(BIBLE_BUILD_TABS).forEach(function (key) {
    refreshBibleBuild(key, points[key]);
  });
}

/** Where each size lives (1-based) in the three tabs the day's use is derived from. */
var USE_COLS = {
  indi: { eon: 3, twopm: 6, after: 2 },
  small: { eon: 4, twopm: 7, after: 3 },
  large: { eon: 5, twopm: 8, after: 4 },
  sic: { eon: 6, twopm: 9, after: 5 },
};

/**
 * Rewrite the three use tabs and each Bieblerb tab's A-F history from the
 * recorded tabs, so the fit eats nights worked out HERE rather than whatever
 * one phone could see. Returns the points the fit is made from, per bible.
 *
 * Older phones still post their own AM Dough Use / PM Dough Use rows and a
 * New Bieblerb row; they are accepted (never reject a stale cache) and then
 * overwritten by this rewrite, so there is no deploy-order hazard either way.
 */
function rebuildBibleHistories() {
  var ss = SpreadsheetApp.getActive();
  var index = {};
  [T_IN, T_AFTER, T_EON].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var byDate = {};
    var last = sheet ? sheet.getLastRow() : 0;
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, TABS[name].length).getValues().forEach(function (row) {
        var d = normalizeDate(row[0]);
        if (d && !byDate[d]) byDate[d] = row; // first match wins, as everywhere
      });
    }
    index[name] = byDate;
  });

  var derived = deriveUse(index);

  USE_KINDS.forEach(function (kind) {
    writeUseTab(ss, USE_TABS[kind], TABS[USE_TABS[kind]], derived.rows[kind]);
  });

  Object.keys(BIBLE_BUILD_TABS).forEach(function (key) {
    var sheet = ss.getSheetByName(BIBLE_BUILD_TABS[key]);
    if (!sheet) return;
    var rows = derived.history[key];
    var stale = sheet.getLastRow();
    if (stale >= 2) sheet.getRange(2, 1, stale - 1, 6).clearContent();
    if (rows.length) {
      ensureRows(sheet, rows.length + 1);
      sheet.getRange(2, 1, rows.length, 6).setValues(rows);
    }
  });

  return derived.points;
}

/**
 * Every recorded night's dough use, three ways, from the recorded tabs:
 *
 *   AM use  = YESTERDAY'S EON count - today's 2 PM count   against the 2 PM takings
 *   PM use  = Estimated Dough After Gang - tonight's EON   against the takings since 2 PM
 *   All Day = the two added                                against the night's takings
 *
 * Every input already sits in this notebook, which is the point: the app's
 * own morning figure came from one phone's copy of yesterday, and vanished on
 * a second phone or after a wipe.
 *
 * Yesterday exactly (owner's rule, Aug 2026 - "just to be extra safe"): a
 * morning whose previous close is older than one day abstains rather than
 * guesses. No lookback across closed days. That is also the app's own
 * on-screen AM rule (computeAmUse).
 *
 * Each of the three kinds is its own data point for the fit - a morning is a
 * complete observation of dough against takings even when the night was never
 * closed out, and a night whose morning was miscounted still has its evening.
 * A half is dropped on its own: no row, a blank count, or a count that ROSE
 * (a miscount, not negative use). The All Day point needs both halves. A
 * point also needs takings on its own scale (2 PM sales, sales since 2 PM,
 * the night's total) to sit against.
 *
 * Then, per bible, size and kind, a wild night is left out: dough per $1,000
 * outside 1.5x the middle spread of that kind's nights (four or more of them,
 * and only when that spread is not zero - a spread of nothing cannot pick an
 * outlier, and Sicilian is often 0). Its figures are still written; the
 * Ignored column just says so.
 *
 * Every measured value is written to the tabs. Cells are blank only where a
 * half is unknowable, and the sales cell where there were no takings. The
 * Ignored column carries the reasons, in words: row-level ones first (no
 * close yesterday, no after-gang figure, no takings), then per size (Small
 * negative, Large not counted, Indi outlier). Nights split regular/peach by
 * the 2 PM row's Bible cell, falling back to the date rule.
 */
function deriveUse(index) {
  var dates = {};
  Object.keys(index[T_IN]).forEach(function (d) { dates[d] = true; });
  Object.keys(index[T_EON]).forEach(function (d) { dates[d] = true; });

  var sizes = Object.keys(USE_COLS);
  var nights = {};
  var candidates = { dough: {}, peach: {} };
  var points = { dough: {}, peach: {} };
  ['dough', 'peach'].forEach(function (bucket) {
    sizes.forEach(function (size) {
      candidates[bucket][size] = { am: [], pm: [], day: [] };
      points[bucket][size] = { kept: [], am: 0, pm: 0, day: 0, dropped: 0 };
    });
  });

  Object.keys(dates).sort().forEach(function (date) {
    var twopmRow = index[T_IN][date] || null;
    var eonRow = index[T_EON][date] || null;
    var afterRow = index[T_AFTER][date] || null;
    var lastEonRow = index[T_EON][addDaysIso(date, -1)] || null;

    var bible = twopmRow ? String(twopmRow[10]).toLowerCase() : '';
    var bucket = bible === 'peach' ? 'peach' : bible === 'regular' ? 'dough' : isPeachDate(date) ? 'peach' : 'dough';

    // Each kind's takings, on its own scale.
    var amSales = twopmRow ? numOrNull(twopmRow[2]) : null; // col C, Current Sales
    var eonSales = eonRow ? numOrNull(eonRow[1]) : null; // col B, EON Sales
    var pmSales = amSales !== null && eonSales !== null ? eonSales - amSales : null;
    var sales = { am: amSales, pm: pmSales, day: eonSales };

    // What rules a whole kind out before any size is looked at.
    var why = { am: [], pm: [], day: [] };
    var has = { am: !!twopmRow, pm: !!eonRow, day: !!eonRow };
    if (has.am) {
      if (!lastEonRow) why.am.push('no close yesterday');
      if (amSales === null || amSales <= 0) why.am.push('no takings');
    }
    if (has.pm) {
      if (!afterRow) why.pm.push('no after-gang figure');
      if (pmSales === null || pmSales <= 0) why.pm.push('no takings');
      if (!lastEonRow) why.day.push('no close yesterday');
      if (!afterRow) why.day.push('no after-gang figure');
      if (eonSales === null || eonSales <= 0) why.day.push('no takings');
    }

    var use = { am: {}, pm: {}, day: {} };
    var marks = { am: [], pm: [], day: [] };
    sizes.forEach(function (size) {
      var cols = USE_COLS[size];
      var am = half(lastEonRow, cols.eon, twopmRow, cols.twopm);
      var pm = half(afterRow, cols.after, eonRow, cols.eon);
      use.am[size] = am.use;
      use.pm[size] = pm.use;
      use.day[size] = am.use !== null && pm.use !== null ? am.use + pm.use : null;
      // A missing row is already explained at row level; a blank or risen
      // count is news about that size.
      if (has.am && am.why && am.why !== 'no row') marks.am.push(SIZE_LABEL[size] + ' ' + am.why);
      if (has.pm && pm.why && pm.why !== 'no row') marks.pm.push(SIZE_LABEL[size] + ' ' + pm.why);
      if (has.day && use.day[size] === null) {
        if (am.why && am.why !== 'no row') marks.day.push(SIZE_LABEL[size] + ' AM ' + am.why);
        else if (pm.why && pm.why !== 'no row') marks.day.push(SIZE_LABEL[size] + ' PM ' + pm.why);
      }
      USE_KINDS.forEach(function (kind) {
        if (has[kind] && why[kind].length === 0 && use[kind][size] !== null) {
          candidates[bucket][size][kind].push({ date: date, sales: sales[kind], use: use[kind][size] });
        }
      });
    });

    nights[date] = { bucket: bucket, has: has, sales: sales, use: use, why: why, marks: marks };
  });

  // The outlier pass: per bible, size and kind, against that kind's own nights.
  ['dough', 'peach'].forEach(function (bucket) {
    sizes.forEach(function (size) {
      USE_KINDS.forEach(function (kind) {
        var list = candidates[bucket][size][kind];
        var ratio = function (p) { return p.use / (p.sales / 1000); };
        var fences = outlierFences(list.map(ratio));
        list.forEach(function (p) {
          if (fences && (ratio(p) < fences.lo || ratio(p) > fences.hi)) {
            nights[p.date].marks[kind].push(SIZE_LABEL[size] + ' outlier');
            points[bucket][size].dropped += 1;
          } else {
            points[bucket][size].kept.push([p.sales, p.use, p.date]);
            points[bucket][size][kind] += 1;
          }
        });
      });
    });
  });

  var rows = { am: [], pm: [], day: [] };
  var history = { dough: [], peach: [] };
  var cell = function (v) { return v === null ? '' : v; };
  Object.keys(nights).sort().forEach(function (date) {
    var n = nights[date];
    var bibleLabel = n.bucket === 'peach' ? 'peach' : 'regular';
    USE_KINDS.forEach(function (kind) {
      if (!n.has[kind]) return;
      var takings = n.sales[kind] !== null && n.sales[kind] > 0 ? n.sales[kind] : '';
      rows[kind].push([
        date, takings,
        cell(n.use[kind].indi), cell(n.use[kind].small), cell(n.use[kind].large), cell(n.use[kind].sic),
        bibleLabel, n.why[kind].concat(n.marks[kind]).join(', '),
      ]);
    });
    // The A-F history: nights with takings and at least one whole-day size.
    var anyDay = sizes.some(function (size) { return n.use.day[size] !== null; });
    if (n.has.day && n.sales.day !== null && n.sales.day > 0 && anyDay) {
      history[n.bucket].push([date, n.sales.day,
        cell(n.use.day.indi), cell(n.use.day.small), cell(n.use.day.large), cell(n.use.day.sic)]);
    }
  });

  return { rows: rows, history: history, points: points };
}

/** One half of a night's use: before - after. Says why when it cannot. */
function half(beforeRow, beforeCol, afterRow, afterCol) {
  if (!beforeRow || !afterRow) return { use: null, why: 'no row' };
  var before = numOrNull(beforeRow[beforeCol - 1]);
  var after = numOrNull(afterRow[afterCol - 1]);
  if (before === null || after === null) return { use: null, why: 'not counted' };
  var used = before - after;
  return used < 0 ? { use: null, why: 'negative' } : { use: used, why: '' }; // a count that rose is a miscount
}

/**
 * Rewrite one use tab in full: headings (which also heals a tab from before
 * the Ignored column), then every night ascending. clearContent, not clear():
 * clear() would also strip the date format and the frozen heading row.
 */
function writeUseTab(ss, name, headers, rows) {
  var sheet = makeTab(ss, name);
  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, headers.length).clearContent();
  writeHeaders(sheet, headers);
  if (rows.length) {
    ensureRows(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

/** 'YYYY-MM-DD' plus a day count, timezone-proof (pure string-and-UTC maths). */
function addDaysIso(iso, delta) {
  var parts = iso.split('-');
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + delta));
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/** Peach season by date, inclusive both ends - the fallback when no Bible cell says. */
function isPeachDate(iso) {
  var md = iso.slice(5);
  return md >= PEACH_START && md <= PEACH_END;
}

/**
 * Fit one line per size through every surviving point of all three kinds -
 * mornings, nights and whole days together - and write the suggestion at each
 * of the mirror's thresholds beside the current bible. A size needs three
 * distinct nights behind it before its column says anything; under that any
 * line is noise. The block from X records what each line rests on.
 */
function refreshBibleBuild(key, sizePoints) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(BIBLE_BUILD_TABS[key]);
  var mirror = ss.getSheetByName(BIBLE_TABS[key]);
  if (!sheet || !mirror || mirror.getLastRow() < 2) return;

  var thresholds = mirror.getRange(2, 1, mirror.getLastRow() - 1, 5).getValues();
  var stats = [];
  Object.keys(BIBLE_BUILD_BLOCK).forEach(function (size, sizeIndex) {
    var p = (sizePoints && sizePoints[size]) || { kept: [], am: 0, pm: 0, day: 0, dropped: 0 };
    var points = p.kept.map(function (k) { return [k[0], k[1]]; });
    var nights = {};
    p.kept.forEach(function (k) { nights[k[2]] = true; });
    var nightCount = Object.keys(nights).length;
    var fit = nightCount >= 3 ? theilSen(points) : null;
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
    stats.push([SIZE_LABEL[size], points.length, nightCount, p.am, p.pm, p.day, p.dropped]);
  });

  sheet.getRange(1, BIBLE_BUILD_STATS_COL, 1, BIBLE_BUILD_STATS_HEADERS.length)
    .setValues([BIBLE_BUILD_STATS_HEADERS]).setFontWeight('bold');
  ensureRows(sheet, stats.length + 1);
  sheet.getRange(2, BIBLE_BUILD_STATS_COL, stats.length, BIBLE_BUILD_STATS_HEADERS.length).setValues(stats);
}

/**
 * Both bibles' suggestion blocks, paired for the app's graph: per sales row,
 * what the bible says today beside what the recorded nights suggest.
 *
 * refreshBibleBuild() writes all four size blocks in one pass against the same
 * mirror thresholds, so they line up row for row and the sales column can be
 * taken from the first block. One getValues() per tab covers H..V.
 *
 * A size with fewer than three usable nights is written as '' up there, and it
 * has to come back as NULL - Number('') is 0, which would draw a suggestion of
 * "make none" instead of "nothing to suggest yet".
 */
var BIBLE_BUILD_FIRST_COL = 8; // H, the indi block
var BIBLE_BUILD_WIDTH = 15; // H..V: four 3-column blocks with a gap between each

function readBibleBuilds() {
  var ss = SpreadsheetApp.getActive();
  var sizes = Object.keys(BIBLE_BUILD_BLOCK);
  var out = {};
  Object.keys(BIBLE_BUILD_TABS).forEach(function (key) {
    var sheet = ss.getSheetByName(BIBLE_BUILD_TABS[key]);
    var last = sheet ? sheet.getLastRow() : 0;
    if (!sheet || last < 2) {
      out[key] = [];
      return;
    }
    var block = sheet
      .getRange(2, BIBLE_BUILD_FIRST_COL, last - 1, BIBLE_BUILD_WIDTH)
      .getValues();
    var rows = [];
    block.forEach(function (row) {
      // Offsets are relative to column H, the start of the block we just read.
      var sales = numOrNull(row[0]);
      if (sales === null) return; // a row past the end of the thresholds
      var oldSide = {};
      var newSide = {};
      sizes.forEach(function (size) {
        var at = BIBLE_BUILD_BLOCK[size] - BIBLE_BUILD_FIRST_COL;
        oldSide[size] = numOrNull(row[at + 1]);
        newSide[size] = numOrNull(row[at + 2]);
      });
      rows.push({ sales: sales, old: oldSide, 'new': newSide });
    });
    out[key] = rows;
  });
  return out;
}

/** A cell as a number, or null for blank/unreadable. Never 0 by accident. */
function numOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = Number(value);
  return isFinite(n) ? n : null;
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

/**
 * The fences a wild value falls outside: 1.5x the middle spread past the
 * quartiles (quartiles by median-of-halves). Null under four values, and null
 * when the spread is zero - identical values cannot say which one is odd.
 */
function outlierFences(values) {
  if (values.length < 4) return null;
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  var q1 = median(sorted.slice(0, mid));
  var q3 = median(sorted.slice(sorted.length % 2 ? mid + 1 : mid));
  var iqr = q3 - q1;
  if (iqr <= 0) return null;
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
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
    // 'range' has one caller: scripts/import-history.ts --mode verify. The
    // app itself asks only for 'date', 'recent' and 'bibles'.
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
    if (p.action === 'bibles') {
      return jsonOut({ ok: true, bibles: readBibleBuilds() });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + p.action });
  } catch (err) {
    // The read path has no guards of its own to refuse with, so anything
    // thrown here is Google misbehaving mid-read - worth the app retrying,
    // never worth a red "SHEET REFUSED" the owner cannot act on.
    return jsonOut({ ok: false, retryable: true, error: String(err) });
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
