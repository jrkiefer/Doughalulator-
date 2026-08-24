/**
 * Pure record → spreadsheet-row mapping. No I/O here — these functions turn
 * engine records into the exact rows each sheet tab expects, and back again
 * for loading. The Apps Script merges each row into its tab by Date, writing
 * ONLY the columns present in the payload. Blanks travel as EMPTY CELLS —
 * never fabricated zeros. The two Rounding columns carry the owner's TAP
 * (blank = auto), never the direction the night resolved to.
 */
import type { AppConfig } from '../config';
import type { AmUse, Bibles, CountedInventory, DoughDayRecord, EonRecord, Maybe } from '../core/types';

/** One tab's worth of a save: the row is merged into the tab by Date. */
export interface TabWrite {
  tab: string;
  row: Record<string, string | number>;
}

/** Blank cell for unknowns — the sheet mirrors "not entered", never a fake 0. */
function cellOf(value: Maybe): string | number {
  return value === null ? '' : value;
}

/** The tabs the app writes. It works out every number in them. */
export const DAY_TAB = '2PM Dough Count';
export const EON_TAB = 'EON Dough Count';
export const PM_LOOKUP_TAB = 'Look up Dough Use for PM';
export const TOMORROW_LOOKUP_TAB = 'Look up Dough Use Tomorrow';
export const MAKE_TAB = 'Dough Make (estimate)';
export const FINAL_MAKE_TAB = 'Final Make Amount';
export const AFTER_TAB = 'Estimated Dough After Gang';
export const AM_USE_TAB = 'AM Dough Use';
export const PM_USE_TAB = 'PM Dough Use';
/** The tabs whose history the new-bible suggestion is fitted from. */
export const BIBLE_BUILD_TABS = { regular: 'New Bieblerb', peach: 'New Peach Bieblerb' } as const;

/**
 * Everything the 2 PM save writes: the counts as typed, then each step of the
 * afternoon's maths in its own tab, ending with the dough that will be
 * standing after the dough gang has made it.
 *
 * `amUse` is yesterday's close against this afternoon's count — it belongs to
 * the 2 PM save because both of its inputs are known by then, so a night that
 * never got an EON entry doesn't strand it.
 */
export function dayRecordToTabWrites(record: DoughDayRecord, amUse?: AmUse | null): TabWrite[] {
  const d = record.date;
  const chosen =
    record.chosenBatchOption === 'down'
      ? record.batchDown
      : record.chosenBatchOption === 'up'
        ? record.batchUp
        : null;

  const writes: TabWrite[] = [
    {
      tab: DAY_TAB,
      row: {
        Date: d,
        "Today's Forecast": cellOf(record.todayForecast),
        'Current Sales': cellOf(record.currentSales),
        'Sales Left': cellOf(record.salesLeft),
        "Tomorrow's Forecast": cellOf(record.tomorrowForecast),
        'Indi Count': cellOf(record.have.indi),
        'Small Count': cellOf(record.have.small),
        'Large Count': cellOf(record.have.large),
        'Sic Count': cellOf(record.have.sic),
        'Boli Count': cellOf(record.have.boli),
        Bible: record.bibleUsed,
        'Forecast Rounding': stampedForecastRound(record),
        'Batch Rounding': stampedBatchRound(record),
      },
    },
    {
      tab: PM_LOOKUP_TAB,
      row: {
        Date: d,
        Bible: record.bibleUsed,
        'Forecast Rounding': stampedForecastRound(record),
        'Sales Left': cellOf(record.salesLeft),
        Indi: cellOf(record.use.indi),
        Small: cellOf(record.use.small),
        Large: cellOf(record.use.large),
        Sic: cellOf(record.use.sic),
      },
    },
    {
      tab: TOMORROW_LOOKUP_TAB,
      row: {
        Date: d,
        Bible: record.bibleUsed,
        'Forecast Rounding': stampedForecastRound(record),
        "Tomorrow's Forecast": cellOf(record.tomorrowForecast),
        Indi: cellOf(record.need.indi),
        Small: cellOf(record.need.small),
        Large: cellOf(record.need.large),
        Sic: cellOf(record.need.sic),
      },
    },
    {
      tab: MAKE_TAB,
      row: {
        Date: d,
        'Indi Trays': cellOf(record.trays.indi),
        'Small Trays': cellOf(record.trays.small),
        'Large Trays': cellOf(record.trays.large),
        'Sic (balls)': cellOf(record.sicBalls),
        'Boli Trays': cellOf(record.boliTrays),
        'Batch Rounding': stampedBatchRound(record),
        'Trays Total': cellOf(record.totalTrays),
        Batches: chosen === null ? '' : chosen.batches,
      },
    },
  ];

  // The make and the resulting dough exist as soon as there is a batch
  // direction — since v1.13.0 the remainder rule always resolves one. When
  // there is NO direction (nothing to make, or the inputs went unknown
  // again), the rows still travel — as ALL-BLANK cells. Blanks clear: a make
  // saved earlier tonight and then un-decided must not survive on the sheet,
  // where the self-building bible would read the stale after-gang figure as
  // tonight's truth. The script skips an all-blank row for a date that has
  // none (blank rows clear, they never create), so this costs no clutter.
  writes.push(
    {
      tab: FINAL_MAKE_TAB,
      row: {
        Date: d,
        'Indi Trays': cellOf(chosen ? chosen.finalTraysToMake.indi : null),
        'Small Trays': cellOf(chosen ? chosen.finalTraysToMake.small : null),
        'Large Trays': cellOf(chosen ? chosen.finalTraysToMake.large : null),
        'Sic (balls)': cellOf(chosen ? record.sicBalls : null),
        'Boli Trays': cellOf(chosen ? chosen.finalTraysToMake.boli : null),
      },
    },
    {
      tab: AFTER_TAB,
      row: {
        Date: d,
        Indi: cellOf(chosen ? chosen.finalDough.indiTotal : null),
        Small: cellOf(chosen ? chosen.finalDough.smallTotal : null),
        Large: cellOf(chosen ? chosen.finalDough.largeTotal : null),
        Sic: cellOf(chosen ? chosen.finalDough.sicTotal : null),
        Boli: cellOf(chosen ? chosen.finalDough.boliTotal : null),
      },
    },
    // The morning's use rides with the 2 PM save (both of its inputs are known
    // by then). Same retraction rule: no yesterday means BLANKS, clearing any
    // morning figure a previously-cached yesterday once produced.
    {
      tab: AM_USE_TAB,
      row: {
        Date: d,
        'AM Sales $': cellOf(amUse ? amUse.sales : null),
        'AM Indi Use': cellOf(amUse ? amUse.use.indi : null),
        'AM Small Use': cellOf(amUse ? amUse.use.small : null),
        'AM Large Use': cellOf(amUse ? amUse.use.large : null),
        'AM Sic Use': cellOf(amUse ? amUse.use.sic : null),
        'Bible Used': amUse ? record.bibleUsed : '',
      },
    },
  );

  return writes;
}

/** Everything the EON save writes: the final count, and what the night used. */
export function eonRecordToTabWrites(
  record: EonRecord,
  bible?: string,
  amUse?: AmUse | null,
): TabWrite[] {
  const d = record.date;
  const writes: TabWrite[] = [
    {
      tab: EON_TAB,
      row: {
        Date: d,
        'EON Sales': cellOf(record.finalSales),
        'EON Indi Count': cellOf(record.eonHave.indi),
        'EON Small Count': cellOf(record.eonHave.small),
        'EON Large Count': cellOf(record.eonHave.large),
        'EON Sic Count': cellOf(record.eonHave.sic),
      },
    },
  ];

  // The night's use always travels — as blanks when it is unknowable (no
  // batch choice standing), which CLEARS a use recorded earlier and since
  // retracted. The script skips an all-blank row for a date that has none.
  const pm = record.pmUse;
  writes.push({
    tab: PM_USE_TAB,
    row: {
      Date: d,
      // A night whose final sales came in under the 2 PM figure has no
      // meaningful PM takings — the owner's own sheet showed NA() here.
      'PM Sales $': pm === null || (record.pmSales !== null && record.pmSales < 0) ? '' : cellOf(record.pmSales),
      'PM Indi Use': cellOf(pm ? pm.indi : null),
      'PM Small Use': cellOf(pm ? pm.small : null),
      'PM Large Use': cellOf(pm ? pm.large : null),
      'PM Sic Use': cellOf(pm ? pm.sic : null),
      'Bible Used': pm ? (bible ?? record.bibleUsed ?? '') : '',
    },
  });

  // Tonight's line on the bible this date used — the history the suggested
  // bible is fitted from. Total use is the morning's plus the night's.
  // The same fallback as the row above: on a night with no 2 PM record there is
  // no day-record bible, and only the EON record knows which one applied.
  const season = (bible ?? record.bibleUsed) === 'peach' ? 'peach' : 'regular';
  const nightly = (size: 'indi' | 'small' | 'large' | 'sic') => {
    const am = amUse?.use[size] ?? null;
    const pm = record.pmUse?.[size] ?? null;
    if (am === null && pm === null) return '';
    return (am ?? 0) + (pm ?? 0);
  };
  // Only a night with real takings can teach the bible anything.
  if (record.finalSales !== null && record.finalSales > 0) {
    writes.push({
      tab: BIBLE_BUILD_TABS[season],
      row: {
        Date: record.date,
        'Total Sales': record.finalSales,
        Indi: nightly('indi'),
        Small: nightly('small'),
        Large: nightly('large'),
        Sic: nightly('sic'),
      },
    });
  }

  return writes;
}

/**
 * What the owner TAPPED, not what the night resolved to — blank means "auto".
 * Writing the resolved direction instead would freeze tonight's answer into the
 * record, so a reloaded night would stop re-resolving as its inputs change.
 */
function stampedForecastRound(record: DoughDayRecord): string {
  return record.rounding.forecastAuto ? '' : record.rounding.forecast;
}

function stampedBatchRound(record: DoughDayRecord): string {
  return record.rounding.batchesAuto ? '' : (record.rounding.batches ?? '');
}

export function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface BiblesPayload {
  type: 'bibles';
  hash: string;
  bibles: {
    dough: { name: string; season: string; notes: string; rows: (string | number)[][] };
    peach: { name: string; season: string; notes: string; rows: (string | number)[][] };
  };
}

/** The read-only bible mirror for the sheet, with a content hash gate. */
export function biblesToPayload(bibles: Bibles): BiblesPayload {
  const table = (bible: Bibles['regular']) => ({
    name: bible.name,
    season: `${bible.season.start} – ${bible.season.end}`,
    notes: bible.notes,
    rows: bible.rows.map((r) => [r.sales, r.indi, r.small, r.large, r.sic]),
  });
  const body = { dough: table(bibles.regular), peach: table(bibles.peach) };
  return { type: 'bibles', hash: hashString(JSON.stringify(body)), bibles: body };
}

// ————— Temps —————

export interface TempsReading {
  station: string;
  temp: number;
}

export interface TempsPayload {
  type: 'temps';
  date: string;
  time: string;
  /** Display name of the slot column, e.g. "2 PM". */
  slot: string;
  readings: TempsReading[];
}

/**
 * A temps submission: only stations with a value are included — empty
 * stations are simply skipped. The script appends every reading to Log
 * (full audit trail) and merges each into its station tab by date.
 */
export function tempsToPayload(
  date: string,
  time: string,
  slot: 'morning' | 'midday' | 'night',
  values: Record<string, string>,
  config: AppConfig,
): TempsPayload {
  const slotName = {
    morning: config.tempSlots.names.morning,
    midday: config.tempSlots.names.midday,
    night: config.tempSlots.names.night,
  }[slot];
  const readings = config.stations
    .filter((station) => (values[station] ?? '').trim() !== '')
    .map((station) => ({ station, temp: Number(values[station]) }))
    .filter((r) => Number.isFinite(r.temp));
  return { type: 'temps', date, time, slot: slotName, readings };
}

/** Log rows the script appends: Date | Time | Slot | Station | Temp. */
export function tempsLogRows(payload: TempsPayload): (string | number)[][] {
  return payload.readings.map((r) => [payload.date, payload.time, payload.slot, r.station, r.temp]);
}

/** Station-tab merges: one row per station, only the submitted slot's column. */
export function tempsStationWrites(payload: TempsPayload): TabWrite[] {
  return payload.readings.map((r) => ({
    tab: r.station,
    row: { Date: payload.date, [payload.slot]: r.temp },
  }));
}

/** Overview refresh: Station | Last Temp | Slot | When, for the submitted stations. */
export function tempsOverviewRows(payload: TempsPayload): (string | number)[][] {
  return payload.readings.map((r) => [
    r.station,
    r.temp,
    payload.slot,
    `${payload.date} ${payload.time}`,
  ]);
}

// ————— Reverse mapping (loading a saved day back into the app) —————

type SheetRow = Record<string, string | number>;

/** Sheet cell → form string. Blanks stay blank; a stored 0 comes back as '0'. */
function cell(row: SheetRow, key: string): string {
  const v = row[key];
  return v === undefined || v === null ? '' : String(v);
}

/**
 * The count tabs hold whole-ball totals per size, so a loaded row comes back
 * in the Singles fields with Trays blank. That is faithful — the sheet never
 * knew the tray/singles split — and the totals are what the math uses.
 */
export function countsRowToFields(row: SheetRow, prefix = ''): Record<string, string> {
  const count = (size: string) => cell(row, `${prefix}${size} Count`);
  return {
    indiTrays: '',
    indiSingles: count('Indi'),
    smallTrays: '',
    smallSingles: count('Small'),
    largeTrays: '',
    largeSingles: count('Large'),
    sicSingles: count('Sic'),
    boliTrays: '',
    boliSingles: count('Boli'),
  };
}

/** 2 PM row → the three sales strings the form holds. */
export function salesRowToFields(row: SheetRow): {
  todayForecast: string;
  currentSales: string;
  tomorrowForecast: string;
} {
  return {
    todayForecast: cell(row, "Today's Forecast"),
    currentSales: cell(row, 'Current Sales'),
    tomorrowForecast: cell(row, "Tomorrow's Forecast"),
  };
}

/** 2 PM row → which bible the record used. */
export function salesRowToBible(row: SheetRow): 'regular' | 'peach' | null {
  const v = cell(row, 'Bible').toLowerCase();
  return v === 'peach' ? 'peach' : v === 'regular' ? 'regular' : null;
}

/** 2 PM row → the tapped batch-rounding choice. Blank = auto, so null. */
export function summaryRowToRounding(row: SheetRow): 'down' | 'up' | null {
  const v = cell(row, 'Batch Rounding').toLowerCase();
  return v === 'up' ? 'up' : v === 'down' ? 'down' : null;
}

/** 2 PM row → the tapped forecast-rounding choice. Blank = auto, so null. */
export function summaryRowToForecastRounding(row: SheetRow): 'down' | 'up' | null {
  const v = cell(row, 'Forecast Rounding').toLowerCase();
  return v === 'up' ? 'up' : v === 'down' ? 'down' : null;
}

/** EON row → the EON form's final-sales string. */
export function eonCountRowToFinalSales(row: SheetRow): string {
  return cell(row, 'EON Sales');
}

/** History-card lines from a `recent` fetch. Newest first. */
export interface HistorySummary {
  date: string;
  finalSales: string;
  batchesMade: string;
}

export function summaryRowsToHistory(
  dates: Record<string, Record<string, SheetRow | null> | null>,
): HistorySummary[] {
  return Object.entries(dates)
    .filter((entry): entry is [string, Record<string, SheetRow | null>] => entry[1] !== null)
    .map(([date, tabs]) => {
      const eon = tabs[EON_TAB];
      const make = tabs[MAKE_TAB];
      return {
        date,
        finalSales: eon ? cell(eon, 'EON Sales') : '',
        batchesMade: make ? cell(make, 'Batches') : '',
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export type { CountedInventory };
