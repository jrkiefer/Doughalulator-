/**
 * Hot Tomato Temp Log — Google Apps Script.
 *
 * Setup: same dance as the dough script — paste into a blank sheet's Apps
 * Script editor, set SECRET, run setup() once, deploy as a web app
 * (execute as Me, access: Anyone), then give the app the URL + secret in
 * Settings.
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
 *   { secret, type: 'temps', date, items: [{ time, slot, readings: [{station, temp}] }] }
 *
 * Writes run under a script lock; a busy lock answers retryable-shaped so
 * the app just tries again. Temps may be negative (the freezer) — but a
 * save with no readings, a bad date, or an unknown slot is rejected.
 */

var SECRET = 'PASTE-YOUR-SECRET-HERE';

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

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return jsonOut({ ok: false, retryable: true, error: 'busy — another save is writing; try again' });
  }
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });
    if (body.type !== 'temps') return jsonOut({ ok: false, error: 'unknown type: ' + body.type });

    var problem = validateTemps(body);
    if (problem) return jsonOut({ ok: false, error: problem });

    var ss = SpreadsheetApp.getActive();
    var date = normalizeDate(body.date);
    var saved = 0;

    // Cell-by-cell writes were the slowest part of every save — each section
    // below batches its whole update into ranged writes instead.

    // 1. Append-only audit trail: every reading, one ranged write.
    var logRows = [];
    body.items.forEach(function (item) {
      item.readings.forEach(function (r) {
        logRows.push([date, item.time, item.slot, r.station, r.temp]);
        saved++;
      });
    });
    var log = ss.getSheetByName('Log');
    log.getRange(log.getLastRow() + 1, 1, logRows.length, LOG_HEADERS.length).setValues(logRows);

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
        rowIndex = sheet.getLastRow() + 1;
        values = STATION_HEADERS.map(function () { return ''; });
      } else {
        values = sheet.getRange(rowIndex, 1, 1, STATION_HEADERS.length).getValues()[0];
      }
      values[0] = date;
      Object.keys(slotsByStation[station]).forEach(function (slot) {
        values[STATION_HEADERS.indexOf(slot)] = slotsByStation[station][slot];
      });
      sheet.getRange(rowIndex, 1, 1, STATION_HEADERS.length).setValues([values]);
    });

    // 3. Refresh the Overview block in one ranged write (later slots win).
    var overview = ss.getSheetByName('Overview');
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

    return jsonOut({ ok: true, saved: saved, date: date });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
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
    if (p.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

    if (p.action === 'ping') {
      return jsonOut({ ok: true, sheet: 'temps', time: new Date().toISOString() });
    }
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
    return jsonOut({ ok: false, error: 'unknown action: ' + p.action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** Normalize a date from the app OR a hand-typed sheet cell to YYYY-MM-DD. */
function normalizeDate(value) {
  if (value === null || value === undefined) return '';
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
