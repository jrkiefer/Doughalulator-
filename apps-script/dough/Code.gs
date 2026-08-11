/**
 * Hot Tomato Dough Log — Google Apps Script.
 *
 * Setup: paste into a blank sheet's Apps Script editor, set SECRET, run
 * setup() once, deploy as a web app (execute as Me, access: Anyone), then
 * give the app the URL + secret in Settings.
 *
 * The app POSTs JSON as text/plain (no CORS preflight). Every payload and
 * every GET carries the shared secret. Saves are merge-upserts by Date:
 * only the columns present in the payload are written — and blank values
 * clear their cells (the sheet mirrors "not entered", never a fake 0).
 *
 * All mutating handlers run under a script lock so two phones saving in
 * the same second can never race into duplicate rows; when the lock is
 * busy the answer is retryable-shaped and the app simply tries again.
 *
 * The Dough Use tab is FORMULA-driven (installed by rebuildDoughUse):
 * hand-corrections anywhere in the sheet recompute usage automatically.
 * The fitted-bible tabs suggest new bible numbers from recorded history.
 */

var SECRET = 'PASTE-YOUR-SECRET-HERE';

var SHEET_NAME = 'Hot Tomato Dough Log';

/** Every data tab and its exact header row. Date is always column A. */
var TABS = {
  'Summary': ['Date', 'Bible Used', 'Forecast Tonight $', 'Current Sales $', 'Sales Left $', 'Forecast Tomorrow $', 'Total Trays To Make', 'Exact Batches', 'Chosen (Up/Down)', 'Batches Made', 'Shortage?'],
  'Dough Count': ['Date', 'Indi Trays', 'Indi Singles', 'Indi Have', 'Small Trays', 'Small Singles', 'Small Have', 'Large Trays', 'Large Singles', 'Large Have', 'Sic Have', 'Boli Trays', 'Boli Singles', 'Boli Have'],
  'Sales': ['Date', 'Forecast Tonight (entered)', 'Forecast Tonight $', 'Current Sales (entered)', 'Current Sales $', 'Sales Left $', 'Forecast Tomorrow (entered)', 'Forecast Tomorrow $', 'Bible Used', 'Bible Row Matched Tonight', 'Bible Row Matched Tomorrow'],
  'Use Tonight': ['Date', 'Indi', 'Small', 'Large', 'Sic'],
  'Left': ['Date', 'Indi', 'Small', 'Large', 'Sic', 'Shortages'],
  'Need Tomorrow': ['Date', 'Indi', 'Small', 'Large', 'Sic'],
  'Make': ['Date', 'Indi Balls', 'Indi Trays', 'Small Balls', 'Small Trays', 'Large Balls', 'Large Trays', 'Sic Balls', 'Sic Trays', 'Boli Trays'],
  'Batches': ['Date', 'Total Trays', 'Batches', 'Rounded (Up/Down)', 'Indi', 'Small', 'Large', 'Sic', 'Boli'],
  'Final Dough': ['Date', 'Indi Trays', 'Indi Singles', 'Indi Final', 'Small Trays', 'Small Singles', 'Small Final', 'Large Trays', 'Large Singles', 'Large Final', 'Sic Final', 'Boli Trays', 'Boli Singles', 'Boli Final'],
  'EON Count': ['Date', 'Indi Trays', 'Indi Singles', 'Indi Have', 'Small Trays', 'Small Singles', 'Small Have', 'Large Trays', 'Large Singles', 'Large Have', 'Sic Have', 'Boli Trays', 'Boli Singles', 'Boli Have', 'Final Sales (entered)', 'Final Sales $'],
  'EON Check': ['Date', 'Indi', 'Small', 'Large', 'Sic', 'Boli', 'Trays Short'],
};

var DOUGH_USE_TAB = 'Dough Use';
var DOUGH_USE_HEADERS = ['Date', 'AM Sales $', 'AM Indi', 'AM Small', 'AM Large', 'AM Sic', 'AM Boli', 'PM Sales $', 'PM Indi', 'PM Small', 'PM Large', 'PM Sic', 'PM Boli'];

/** Read-only mirrors of the app's bible JSON, rewritten only when the content hash changes. */
var BIBLE_TABS = { dough: 'Dough Bible', peach: 'Peach Bible' };
var FITTED_TABS = { dough: 'New Dough Bible', peach: 'New Peach Bible' };
var PEACH_START = '07-01';
var PEACH_END = '08-31';

/** Columns whose warning text / negatives render red. */
var RED_COLUMNS = {
  'Left': ['Indi', 'Small', 'Large', 'Sic', 'Shortages'],
  'EON Check': ['Indi', 'Small', 'Large', 'Sic', 'Boli', 'Trays Short'],
};

/** Columns that may legitimately hold negatives — everything else numeric must be ≥ 0. */
var NEGATIVE_OK = {
  'Summary': { 'Sales Left $': true },
  'Sales': { 'Sales Left $': true },
  'Left': { 'Indi': true, 'Small': true, 'Large': true, 'Sic': true },
  'EON Check': { 'Indi': true, 'Small': true, 'Large': true, 'Sic': true, 'Boli': true },
};

// ————— setup —————

/** Safe to re-run any time: creates whatever is missing, refreshes headers, never touches data rows. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getName().indexOf('Untitled') === 0) ss.rename(SHEET_NAME);

  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = TABS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
    (RED_COLUMNS[name] || []).forEach(function (col) {
      var idx = headers.indexOf(col) + 1;
      if (idx > 0) applyRedRule(sheet, idx);
    });
  });

  Object.keys(BIBLE_TABS).forEach(function (key) {
    if (!ss.getSheetByName(BIBLE_TABS[key])) ss.insertSheet(BIBLE_TABS[key]);
  });

  rebuildDoughUse();

  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0) ss.deleteSheet(starter);
}

/** Custom menu so the owner can re-run maintenance without touching code. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🍕 Dough Tools')
    .addItem('Re-run setup', 'setup')
    .addItem('Rebuild Dough Use formulas', 'rebuildDoughUse')
    .addItem('Regenerate fitted bibles', 'generateFittedBibles')
    .addToUi();
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

// ————— live usage analytics —————

/**
 * (Re)install the formula-driven Dough Use tab. Everything here is a live
 * formula, so hand-corrections in any source tab recompute usage instantly:
 *   AM use  = yesterday's EON have − today's 2 PM have (per size)
 *   PM use  = the night's Final Dough − that night's EON have (per size),
 *             blank unless the night actually has final-dough numbers
 *   AM/PM sales derive from the Sales and EON tabs.
 */
function rebuildDoughUse() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(DOUGH_USE_TAB) || ss.insertSheet(DOUGH_USE_TAB);
  sheet.clear();
  sheet.getRange(1, 1, 1, DOUGH_USE_HEADERS.length).setValues([DOUGH_USE_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');

  // Per-size Have/Final columns inside their tabs: indi 4, small 7, large 10, sic 11, boli 14.
  var SIZE_COL = { indi: 4, small: 7, large: 10, sic: 11, boli: 14 };
  var sizes = ['indi', 'small', 'large', 'sic', 'boli'];

  // IFERROR: an empty log (fresh sheet or after a wipe) shows blank, not #N/A.
  var dates =
    '=IFERROR(SORT(UNIQUE(FILTER({\'Dough Count\'!A2:A;\'EON Count\'!A2:A},{\'Dough Count\'!A2:A;\'EON Count\'!A2:A}<>""))),)';
  var amSales =
    '=ARRAYFORMULA(IF($A2:$A="",,IFERROR(VLOOKUP($A2:$A,Sales!$A:$E,5,FALSE),)))';
  var pmSales =
    '=ARRAYFORMULA(IF($A2:$A="",,IFERROR(VLOOKUP($A2:$A,\'EON Count\'!$A:$P,16,FALSE)-VLOOKUP($A2:$A,Sales!$A:$E,5,FALSE),)))';
  function amUse(size) {
    var c = SIZE_COL[size];
    return (
      '=ARRAYFORMULA(IF($A2:$A="",,IFERROR(VLOOKUP($A2:$A-1,\'EON Count\'!$A:$N,' + c + ',FALSE)' +
      '-VLOOKUP($A2:$A,\'Dough Count\'!$A:$N,' + c + ',FALSE),)))'
    );
  }
  function pmUse(size) {
    var c = SIZE_COL[size];
    return (
      '=ARRAYFORMULA(IF($A2:$A="",,IFERROR(VLOOKUP($A2:$A,\'Final Dough\'!$A:$N,' + c + ',FALSE)' +
      '-VLOOKUP($A2:$A,\'EON Count\'!$A:$N,' + c + ',FALSE),)))'
    );
  }

  var formulas = [dates, amSales];
  sizes.forEach(function (s) { formulas.push(amUse(s)); });
  formulas.push(pmSales);
  sizes.forEach(function (s) { formulas.push(pmUse(s)); });
  formulas.forEach(function (f, i) {
    sheet.getRange(2, i + 1).setFormula(f);
  });

  // Negatives mean a miscount — paint every use column red when below zero.
  for (var col = 2; col <= DOUGH_USE_HEADERS.length; col++) applyRedRule(sheet, col);
}

/**
 * Fit a robust line (Theil–Sen: median of pairwise slopes) of actual use vs
 * that day's final sales, per size and per season, then emit candidate bible
 * tables at the same sales thresholds as the current bibles — new numbers
 * beside current ones, clearly labeled as suggestions. Read-only; re-run on
 * demand from the menu.
 */
function generateFittedBibles() {
  var ss = SpreadsheetApp.getActive();
  var use = ss.getSheetByName(DOUGH_USE_TAB);
  var eon = ss.getSheetByName('EON Count');
  if (!use || !eon) return;

  // Collect points: x = the day's final sales, y = AM+PM use, per size and season.
  var points = {
    regular: { indi: [], small: [], large: [], sic: [] },
    peach: { indi: [], small: [], large: [], sic: [] },
  };
  var rows = use.getLastRow() >= 2
    ? use.getRange(2, 1, use.getLastRow() - 1, DOUGH_USE_HEADERS.length).getDisplayValues()
    : [];
  var salesByDate = {};
  var eonRows = eon.getLastRow() >= 2
    ? eon.getRange(2, 1, eon.getLastRow() - 1, 16).getDisplayValues()
    : [];
  eonRows.forEach(function (r) {
    var d = normalizeDate(r[0]);
    if (d && r[15] !== '') salesByDate[d] = Number(r[15]);
  });

  var AM_COL = { indi: 2, small: 3, large: 4, sic: 5 };
  var PM_COL = { indi: 9, small: 10, large: 11, sic: 12 };
  rows.forEach(function (r) {
    var d = normalizeDate(r[0]);
    if (!d) return;
    var sales = salesByDate[d];
    if (sales === undefined || !isFinite(sales)) return;
    var season = inPeachWindow(d) ? 'peach' : 'regular';
    Object.keys(AM_COL).forEach(function (size) {
      var am = r[AM_COL[size]] === '' ? null : Number(r[AM_COL[size]]);
      var pm = r[PM_COL[size]] === '' ? null : Number(r[PM_COL[size]]);
      if (am === null && pm === null) return;
      var y = (am || 0) + (pm || 0);
      if (isFinite(y)) points[season][size].push([sales, y]);
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
    'SUGGESTED bible from recorded history — read-only, regenerate from the 🍕 menu. The current bible stays in charge.',
  ).setFontWeight('bold');

  if (!mirror || mirror.getLastRow() < 6) {
    sheet.getRange(3, 1).setValue('The bible mirror tab is empty — save a record first so the app mirrors the bibles.');
    return;
  }
  var mirrorRows = mirror.getRange(6, 1, mirror.getLastRow() - 5, 5).getValues();

  var sizes = ['indi', 'small', 'large', 'sic'];
  var fits = {};
  var enough = false;
  sizes.forEach(function (size) {
    var pts = sizePoints[size];
    fits[size] = pts.length >= 2 ? theilSen(pts) : null;
    if (fits[size]) enough = true;
  });
  if (!enough) {
    sheet.getRange(3, 1).setValue('Not enough history yet — need at least 2 recorded nights in this season.');
    return;
  }

  var header = ['Sales', 'Indi (new)', 'Indi (now)', 'Small (new)', 'Small (now)', 'Large (new)', 'Large (now)', 'Sic (new)', 'Sic (now)'];
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

/** Median-of-pairwise-slopes fit — outlier nights can't drag the line. */
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

// ————— write path —————

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return jsonOut({ ok: false, retryable: true, error: 'busy — another save is writing; try again' });
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
    if (body.type === 'wipe') {
      if (body.confirm !== 'WIPE ALL DATA') {
        return jsonOut({ ok: false, error: "wipe needs confirm: 'WIPE ALL DATA'" });
      }
      return jsonOut({ ok: true, wiped: wipeAllData() });
    }
    return jsonOut({ ok: false, error: 'unknown type: ' + body.type });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Terminal validation — a rejection here means retrying the same payload is pointless. */
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
        return 'negative value where it makes no sense: ' + write.tab + ' → ' + key + ' = ' + value;
      }
    }
  }
  if (!hasContent) return 'empty save: nothing beyond the date';
  return null;
}

/**
 * Merge-upsert one row into a tab by Date. Only the provided columns change
 * (blank = clear): the tab's data block is read ONCE — which yields both the
 * matching row's position and its current values — the payload's columns are
 * overlaid, and the row goes back in ONE ranged write. Two Sheets calls per
 * tab; per-cell reads and writes were the slowest part of every save.
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
    var col = headers.indexOf(key);
    if (col > 0) values[col] = row[key];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
}

/**
 * Erase every data row in every data tab (headers stay) and delete the
 * fitted-bible suggestion tabs (their source history is gone). The bible
 * mirror tabs and the Dough Use formulas are untouched. Reached only via
 * doPost { type: 'wipe', confirm: 'WIPE ALL DATA' } — the app never sends
 * it; it exists for deliberate clean-slate moments.
 */
function wipeAllData() {
  var ss = SpreadsheetApp.getActive();
  var wiped = 0;
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var last = sheet.getLastRow();
    if (last > 1) {
      // clearContent, not deleteRows: deleting rows shrinks the conditional-format
      // ranges and date formats setup() installed, so later negatives would stop
      // showing red.
      sheet.getRange(2, 1, last - 1, TABS[name].length).clearContent();
      wiped += last - 1;
    }
  });
  Object.keys(FITTED_TABS).forEach(function (key) {
    var sheet = ss.getSheetByName(FITTED_TABS[key]);
    if (sheet) ss.deleteSheet(sheet);
  });
  return wiped;
}

/**
 * Normalize a date from the app OR a sheet cell to YYYY-MM-DD. Accepts ISO,
 * M/D/YYYY, M/D/YY (2-digit years land in 2000–2099), and the real Date
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
 * stops at 1000 rows and a ranged write past that THROWS — which the app
 * would read as a terminal refusal and stop saving for good.
 */
function ensureRows(sheet, lastRow) {
  var max = sheet.getMaxRows();
  if (lastRow > max) sheet.insertRowsAfter(max, lastRow - max);
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

// ————— read path —————

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
 * Read every data tab ONCE and index its rows by date — the whole read path
 * costs one Sheets call per tab no matter how many dates are asked for.
 * (Reading per date per tab meant ~24 calls per day and minutes of waiting
 * once the log held months of history.)
 */
function loadTabIndex() {
  var ss = SpreadsheetApp.getActive();
  var index = {};
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
  var out = {};
  dates.forEach(function (date) {
    var tabs = {};
    Object.keys(TABS).forEach(function (name) {
      tabs[name] = index[name] ? (index[name][date] || null) : null;
    });
    out[date] = tabs;
  });
  return out;
}

/** One date's row from every data tab, keyed by header. Missing tabs/rows → null. */
function readDate(date, index) {
  return readMany([date], index)[date];
}

/** Every date present in Summary or EON Count, ascending. */
function allDates(index) {
  index = index || loadTabIndex();
  var seen = {};
  ['Summary', 'EON Count'].forEach(function (name) {
    if (!index[name]) return;
    Object.keys(index[name]).forEach(function (d) { seen[d] = true; });
  });
  return Object.keys(seen).sort();
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
