/**
 * Hot Tomato Temp Log — Google Apps Script.
 *
 * Setup: same dance as the dough script — paste into the sheet's Apps Script
 * editor, run setup() once, deploy as a web app (execute as Me, access:
 * Anyone), then give the app that URL in Settings. There is no password.
 *
 * THERE IS NO KEY, by the owner's choice. So nothing destructive is reachable
 * over the web: erasing the log is a menu item inside the spreadsheet.
 *
 * Three kinds of tabs:
 *   Overview — one fixed row per station: the latest reading at a glance.
 *   Log      — append-only audit trail: every submission, with clock time,
 *              including corrections. Never edited, never merged.
 *   One tab per station — Date | Morning | 2 PM | Night, merge-upsert by
 *              date; re-entering a slot overwrites the cell while Log
 *              keeps the original.
 *
 * Payloads carry a whole day at once:
 *   { type: 'temps', date, items: [{ time, slot, readings: [{station, temp}] }] }
 *
 * Writes run under a script lock; a busy lock answers retryable-shaped so
 * the app just tries again. Temps may be negative (the freezer) — but a
 * save with no readings, a bad date, or an unknown slot is rejected.
 */

var SHEET_NAME = 'Hot Tomato Temp Log';

/** Stations in walking order — must match the app's config. */
var STATIONS = ['Pizza 1', 'Pizza Lowboy', 'Pizza 2', 'Slice', 'Salad', 'Reach-In', 'Walk-In', 'Freezer'];

var SLOTS = ['Morning', '2 PM', 'Night'];

var OVERVIEW_HEADERS = ['Station', 'Last Temp', 'Slot', 'When'];
var LOG_HEADERS = ['Date', 'Time', 'Slot', 'Station', 'Temp'];
var STATION_HEADERS = ['Date', 'Morning', '2 PM', 'Night'];

/** Safe to re-run: adds anything missing (e.g. a new station tab), never touches existing rows. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getName().indexOf('Untitled') === 0) ss.rename(SHEET_NAME);

  var overview = ss.getSheetByName('Overview') || ss.insertSheet('Overview');
  overview.getRange(1, 1, 1, OVERVIEW_HEADERS.length).setValues([OVERVIEW_HEADERS]).setFontWeight('bold');
  overview.setFrozenRows(1);
  STATIONS.forEach(function (station, i) {
    var cellA = overview.getRange(i + 2, 1);
    if (cellA.getDisplayValue() !== station) cellA.setValue(station);
  });

  var log = ss.getSheetByName('Log') || ss.insertSheet('Log');
  log.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
  log.setFrozenRows(1);
  log.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  log.getRange('B2:B').setNumberFormat('@');

  STATIONS.forEach(function (station) {
    var sheet = ss.getSheetByName(station) || ss.insertSheet(station);
    sheet.getRange(1, 1, 1, STATION_HEADERS.length).setValues([STATION_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  });

  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0) ss.deleteSheet(starter);
}

/** Custom menu so the owner can run maintenance without touching code. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Temp Tools')
    .addItem('Re-run setup', 'setup')
    .addItem('Erase all data', 'eraseAllData')
    .addToUi();
}

/** Erase every reading, after asking twice. Menu-only — never over the web. */
function eraseAllData() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    'Erase all temperatures?',
    'This clears every recorded reading from this notebook, including the ' +
      'Log. The headings and station names stay. This cannot be undone.',
    ui.ButtonSet.YES_NO,
  );
  if (answer !== ui.Button.YES) return;
  ui.alert('Erased ' + wipeAllData() + ' rows.');
}

/**
 * Mark an error as one of OUR OWN refusals — a structural problem the owner
 * can fix (a moved heading, a missing tab). The catch in doPost answers
 * these terminally so the phone TELLS rather than retries; anything thrown
 * WITHOUT the mark is Google misbehaving mid-request and is answered
 * retryable-shaped, which the app's backoff ladder handles by itself.
 */
function refuse(message) {
  var err = new Error(message);
  err.plainRefusal = true;
  return err;
}

/**
 * Refuse to write when a tab's headings are not where this script thinks.
 * Every write below maps a column NAME to a POSITION from this script's own
 * header lists; nothing else ever looks at the sheet's real header row, so a
 * column renamed or reordered by hand would file temperatures into the wrong
 * slot and report success. Throwing turns that into words on the phone.
 */
function assertHeaders(tabName, expected, actual) {
  for (var i = 0; i < expected.length; i++) {
    var found = String(actual[i] === undefined || actual[i] === null ? '' : actual[i]).trim();
    if (found !== expected[i]) {
      throw refuse(
        'the "' + tabName + '" tab has moved its columns - column ' + (i + 1) +
        ' should say "' + expected[i] + '" but says "' + found +
        '". Put that heading back, or run Temp Tools > Re-run setup.');
    }
  }
}

/** Read a tab's header row and check it, in one small ranged read. */
function checkTabHeaders(sheet, expected) {
  var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  assertHeaders(sheet.getName(), expected, actual);
}

/**
 * The last row with a DATE in column A. getLastRow() counts content in ANY
 * column, so a stray note typed far down a tab would push the next append
 * past a gap of blank rows — and, on the Log, would drag the graph's
 * tail-read window away from the real data. One column-A read answers both.
 */
function lastDatedRow(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return 1;
  var values = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  var dated = 1;
  for (var i = 0; i < values.length; i++) {
    if (normalizeDate(values[i][0]) !== '') dated = i + 2;
  }
  return dated;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return jsonOut({ ok: false, retryable: true, error: 'busy — another save is writing; try again' });
  }
  try {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      // A body that is not JSON can never BECOME JSON by resending it.
      return jsonOut({ ok: false, error: 'unreadable save: ' + String(parseErr) });
    }
    // Erasing is deliberately NOT reachable here — see the note up top.
    if (body.type !== 'temps') return jsonOut({ ok: false, error: 'unknown type: ' + body.type });

    var problem = validateTemps(body);
    if (problem) return jsonOut({ ok: false, error: problem });

    var ss = SpreadsheetApp.getActive();
    var date = normalizeDate(body.date);
    var saved = 0;

    // Every heading is checked BEFORE anything is written, so a refusal can
    // never leave the Log holding readings the station tabs never got.
    var log = ss.getSheetByName('Log');
    if (!log) throw refuse('missing tab (run setup): Log');
    checkTabHeaders(log, LOG_HEADERS);
    var stations = {};
    body.items.forEach(function (item) {
      item.readings.forEach(function (r) { stations[r.station] = true; });
    });
    Object.keys(stations).forEach(function (station) {
      var sheet = ss.getSheetByName(station);
      if (sheet) checkTabHeaders(sheet, STATION_HEADERS); // unknown station: Log only
    });
    // The Overview block write further down is POSITIONAL — row 2 is
    // STATIONS[0] and so on — so its station-name column is part of the
    // pre-flight too: a reordered Overview would otherwise file every
    // temperature against the wrong station, silently.
    var overview = ss.getSheetByName('Overview');
    if (overview) {
      checkTabHeaders(overview, OVERVIEW_HEADERS);
      var overviewNames = overview.getRange(2, 1, STATIONS.length, 1).getDisplayValues();
      for (var s = 0; s < STATIONS.length; s++) {
        if (overviewNames[s][0] !== STATIONS[s]) {
          throw refuse(
            'the Overview tab\'s station names have moved - row ' + (s + 2) +
            ' should say "' + STATIONS[s] + '" but says "' + overviewNames[s][0] +
            '". Run Temp Tools > Re-run setup.');
        }
      }
    }

    // Cell-by-cell writes were the slowest part of every save — each section
    // below batches its whole update into ranged writes instead.

    // 1. Append-only audit trail: every reading, one ranged write, appended
    // after the last DATED row so a stray note cannot open a gap.
    var logRows = [];
    body.items.forEach(function (item) {
      item.readings.forEach(function (r) {
        logRows.push([date, item.time, item.slot, r.station, r.temp]);
        saved++;
      });
    });
    var logStart = lastDatedRow(log) + 1;
    ensureRows(log, logStart + logRows.length - 1);
    log.getRange(logStart, 1, logRows.length, LOG_HEADERS.length).setValues(logRows);

    // 2. Merge-upsert each station tab by date: overlay this save's slots on
    // the current row and write the row back in one stroke per station.
    var slotsByStation = {};
    body.items.forEach(function (item) {
      item.readings.forEach(function (r) {
        if (!slotsByStation[r.station]) slotsByStation[r.station] = {};
        slotsByStation[r.station][item.slot] = r.temp;
      });
    });
    Object.keys(slotsByStation).forEach(function (station) {
      var sheet = ss.getSheetByName(station);
      if (!sheet) return; // unknown station: still in the Log above
      var rowIndex = findDateRow(sheet, date);
      var values;
      if (rowIndex === -1) {
        // Append after the last DATED row, not getLastRow(): a stray note
        // far down the tab must not push the next day past a gap.
        rowIndex = lastDatedRow(sheet) + 1;
        ensureRows(sheet, rowIndex);
        values = STATION_HEADERS.map(function () { return ''; });
      } else {
        values = sheet.getRange(rowIndex, 1, 1, STATION_HEADERS.length).getValues()[0];
      }
      values[0] = date;
      Object.keys(slotsByStation[station]).forEach(function (slot) {
        var col = STATION_HEADERS.indexOf(slot);
        if (col < 1) return; // unknown slot: the Log above still has it
        values[col] = slotsByStation[station][slot];
      });
      sheet.getRange(rowIndex, 1, 1, STATION_HEADERS.length).setValues([values]);
    });

    // 3. Refresh the Overview block in one ranged write (later slots win).
    // The name column was verified in the pre-flight above. A MISSING
    // Overview is skipped rather than refused: the Log above is the record,
    // and half a save beats none.
    if (overview) {
      var block = overview.getRange(2, 2, STATIONS.length, 3).getValues();
      var touched = false;
      body.items.forEach(function (item) {
        item.readings.forEach(function (r) {
          var idx = STATIONS.indexOf(r.station);
          if (idx === -1) return;
          block[idx] = [r.temp, item.slot, date + ' ' + item.time];
          touched = true;
        });
      });
      if (touched) overview.getRange(2, 2, STATIONS.length, 3).setValues(block);
    }

    return jsonOut({ ok: true, saved: saved, date: date });
  } catch (err) {
    // Our own guards refuse terminally; everything else is Google's moment.
    if (err && err.plainRefusal) return jsonOut({ ok: false, error: err.message });
    return jsonOut({ ok: false, retryable: true, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Erase the audit Log, every station tab's data rows, and the Overview
 * readings (station names stay). Headers stay everywhere. Reached only via
 * the menu only, never from the web.
 */
function wipeAllData() {
  var ss = SpreadsheetApp.getActive();
  var wiped = 0;
  ['Log'].concat(STATIONS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var last = sheet.getLastRow();
    if (last > 1) {
      // clearContent, not deleteRows — keeps the formats setup() installed.
      var width = name === 'Log' ? LOG_HEADERS.length : STATION_HEADERS.length;
      sheet.getRange(2, 1, last - 1, width).clearContent();
      wiped += last - 1;
    }
  });
  var overview = ss.getSheetByName('Overview');
  if (overview) {
    overview.getRange(2, 2, STATIONS.length, 3).setValues(
      STATIONS.map(function () { return ['', '', '']; }),
    );
  }
  return wiped;
}

/** Terminal validation. Temps MAY be negative (the freezer) — that is not an error. */
function validateTemps(body) {
  if (!normalizeDate(body.date)) return 'missing or invalid date: ' + body.date;
  var items = body.items;
  if (!items || !items.length) return 'empty save: no readings';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (SLOTS.indexOf(item.slot) === -1) return 'unknown slot: ' + item.slot;
    if (!item.readings || !item.readings.length) return 'empty save: slot ' + item.slot + ' has no readings';
    for (var r = 0; r < item.readings.length; r++) {
      if (typeof item.readings[r].temp !== 'number' || !isFinite(item.readings[r].temp)) {
        return 'temperature is not a number: ' + item.readings[r].station;
      }
    }
  }
  return null;
}

function doGet(e) {
  try {
    var p = e.parameter || {};

    if (p.action === 'ping') {
      return jsonOut({ ok: true, sheet: 'temps', time: new Date().toISOString() });
    }
    // 'latest' and 'day' have no caller in the app any more ('latest' fed the
    // removed LOAD LAST TEMPS button; 'day' predates the graph). They are kept
    // deliberately: answering an old cached phone beats breaking it, and both
    // are read-only. The app itself asks only for 'recent'.
    if (p.action === 'latest') {
      var overview = SpreadsheetApp.getActive().getSheetByName('Overview');
      var out = {};
      STATIONS.forEach(function (station, i) {
        var row = overview.getRange(i + 2, 2, 1, 3).getDisplayValues()[0];
        if (row[0] !== '') out[station] = { temp: row[0], slot: row[1], when: row[2] };
      });
      return jsonOut({ ok: true, stations: out });
    }
    if (p.action === 'day') {
      var date = normalizeDate(p.date);
      if (!date) return jsonOut({ ok: false, error: 'missing or invalid date: ' + p.date });
      var ss = SpreadsheetApp.getActive();
      var grid = {};
      STATIONS.forEach(function (station) {
        var sheet = ss.getSheetByName(station);
        if (!sheet) return;
        var rowIndex = findDateRow(sheet, date);
        if (rowIndex === -1) return;
        var values = sheet.getRange(rowIndex, 2, 1, 3).getDisplayValues()[0];
        grid[station] = { 'Morning': values[0], '2 PM': values[1], 'Night': values[2] };
      });
      return jsonOut({ ok: true, date: date, stations: grid });
    }
    if (p.action === 'recent') {
      return jsonOut({ ok: true, stations: recentReadings(Number(p.n)) });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + p.action });
  } catch (err) {
    // The read path has no guards of its own to refuse with, so anything
    // thrown here is Google misbehaving mid-read - worth the app retrying,
    // never worth a red "can't answer" the owner cannot act on.
    return jsonOut({ ok: false, retryable: true, error: String(err) });
  }
}

/**
 * The last few readings per station, oldest first — what the app's temp graph
 * draws. The Log is the truth for "last taken": append-only with clock times,
 * so corrections appear as newer entries, exactly as a paper log would read.
 *
 * Reads only the Log's tail: at 24 rows a day (8 stations x 3 slots) the
 * window below covers well over a week, which is plenty for a graph of the
 * last three. Display values throughout — this script never sees a Date
 * object (see findDateRow), and that stays true here.
 */
var RECENT_WINDOW_ROWS = 250;

function recentReadings(n) {
  var count = Math.max(1, Math.min(10, isFinite(n) && n > 0 ? Math.floor(n) : 3));
  var log = SpreadsheetApp.getActive().getSheetByName('Log');
  var out = {};
  // The window hangs off the last DATED row, not getLastRow(): a stray note
  // typed far below the data would otherwise drag the whole window down onto
  // blank rows and the graph would quietly go empty.
  var last = log ? lastDatedRow(log) : 0;
  if (last < 2) return out;

  var window = Math.min(last - 1, RECENT_WINDOW_ROWS);
  var rows = log.getRange(last - window + 1, 1, window, LOG_HEADERS.length).getDisplayValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    var station = row[3];
    if (STATIONS.indexOf(station) === -1) continue; // a retired station stays in the Log
    var temp = Number(row[4]);
    if (row[4] === '' || !isFinite(temp)) continue;
    if (!out[station]) out[station] = [];
    if (out[station].length >= count) continue;
    // Walking bottom-up, unshift keeps each station's list oldest-first.
    out[station].unshift({ date: normalizeDate(row[0]), time: row[1], slot: row[2], temp: temp });
  }
  return out;
}

/**
 * Normalize a date from the app OR a sheet cell to YYYY-MM-DD — including the
 * real Date objects getValues() hands back for date-formatted cells.
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
 * stops at 1000 rows and a ranged write past that THROWS — and the Log grows
 * by several rows every single save.
 */
function ensureRows(sheet, lastRow) {
  var max = sheet.getMaxRows();
  if (lastRow > max) sheet.insertRowsAfter(max, lastRow - max);
}

function findDateRow(sheet, date) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var values = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeDate(values[i][0]) === date) return i + 2;
  }
  return -1;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
