/**
 * Hot Tomato Temp Log — Google Apps Script.
 *
 * Phase 5 setup: same dance as the dough script — paste into a blank
 * sheet's Apps Script editor, set SECRET, run setup() once, deploy as a
 * web app (execute as Me, access: Anyone), then give the app the URL +
 * secret in Settings.
 *
 * Three kinds of tabs:
 *   Overview — one fixed row per station: the latest reading at a glance.
 *   Log      — append-only audit trail: every submission, with clock time,
 *              including corrections. Never edited, never merged.
 *   One tab per station — Date | Morning | 2 PM | Night, merge-upsert by
 *              date; re-entering a slot overwrites the cell while Log
 *              keeps the original.
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
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });
    if (body.type !== 'temps') return jsonOut({ ok: false, error: 'unknown type: ' + body.type });
    if (SLOTS.indexOf(body.slot) === -1) return jsonOut({ ok: false, error: 'unknown slot: ' + body.slot });

    var ss = SpreadsheetApp.getActive();

    // 1. Append-only audit trail.
    var log = ss.getSheetByName('Log');
    body.readings.forEach(function (r) {
      log.appendRow([body.date, body.time, body.slot, r.station, r.temp]);
    });

    // 2. Merge-upsert each station tab by date, touching only this slot's column.
    body.readings.forEach(function (r) {
      var sheet = ss.getSheetByName(r.station);
      if (!sheet) return; // unknown station: still in the Log above
      var rowIndex = findDateRow(sheet, body.date);
      if (rowIndex === -1) {
        rowIndex = sheet.getLastRow() + 1;
        sheet.getRange(rowIndex, 1).setValue(body.date);
      }
      var col = STATION_HEADERS.indexOf(body.slot) + 1;
      sheet.getRange(rowIndex, col).setValue(r.temp);
    });

    // 3. Refresh the Overview row for each submitted station.
    var overview = ss.getSheetByName('Overview');
    body.readings.forEach(function (r) {
      var idx = STATIONS.indexOf(r.station);
      if (idx === -1) return;
      overview.getRange(idx + 2, 2, 1, 3).setValues([[r.temp, body.slot, body.date + ' ' + body.time]]);
    });

    return jsonOut({ ok: true, saved: body.readings.length, date: body.date, slot: body.slot });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

    if (p.action === 'ping') {
      return jsonOut({ ok: true, sheet: 'temps', time: new Date().toISOString() });
    }
    if (p.action === 'latest') {
      // Latest reading per station, straight off the Overview tab.
      var overview = SpreadsheetApp.getActive().getSheetByName('Overview');
      var out = {};
      STATIONS.forEach(function (station, i) {
        var row = overview.getRange(i + 2, 2, 1, 3).getDisplayValues()[0];
        if (row[0] !== '') out[station] = { temp: row[0], slot: row[1], when: row[2] };
      });
      return jsonOut({ ok: true, stations: out });
    }
    if (p.action === 'day') {
      // One date's Morning / 2 PM / Night grid from the station tabs.
      var ss = SpreadsheetApp.getActive();
      var grid = {};
      STATIONS.forEach(function (station) {
        var sheet = ss.getSheetByName(station);
        if (!sheet) return;
        var rowIndex = findDateRow(sheet, p.date);
        if (rowIndex === -1) return;
        var values = sheet.getRange(rowIndex, 2, 1, 3).getDisplayValues()[0];
        grid[station] = { 'Morning': values[0], '2 PM': values[1], 'Night': values[2] };
      });
      return jsonOut({ ok: true, date: p.date, stations: grid });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + p.action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function findDateRow(sheet, date) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var values = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === date) return i + 2;
  }
  return -1;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
