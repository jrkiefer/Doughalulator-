/**
 * Pure record → spreadsheet-row mapping. No I/O here — these functions turn
 * engine records into the exact rows each sheet tab expects, and back again
 * for loading. The Apps Script merges each row into its tab by Date, writing
 * ONLY the columns present in the payload. Blanks travel as EMPTY CELLS —
 * never fabricated zeros — and columns that depend on the tapped batch
 * choice stay blank until a choice exists.
 */
import type { AppConfig } from '../config';
import type { Bibles, CountedInventory, DoughDayRecord, EonRecord, Maybe } from '../core/types';

/** One tab's worth of a save: the row is merged into the tab by Date. */
export interface TabWrite {
  tab: string;
  row: Record<string, string | number>;
}

/** Blank cell for unknowns — the sheet mirrors "not entered", never a fake 0. */
function cellOf(value: Maybe): string | number {
  return value === null ? '' : value;
}

/** The 2 PM tab name — the only tab a day save writes. */
export const DAY_TAB = '2PM Dough Count';
/** The EON tab name — the only tab an end-of-night save writes. */
export const EON_TAB = 'EON Dough Count';
/** Calculated tabs the app reads back to check the sheet against its own math. */
export const MAKE_TAB = 'Calculation Step Dough Make (estimate)';

/**
 * The 2 PM save: ONE row of what the owner counted and typed. The sheet's
 * formulas take it from there — nothing derived is written, so a hand-edit
 * in the sheet recalculates instead of being overwritten by the next save.
 *
 * Counts go as ball totals, which is what the count columns mean. Forecast
 * Rounding is left blank so the sheet applies the same threshold rule the
 * engine did, and stays free for the owner to override by typing up/down.
 */
export function dayRecordToTabWrites(record: DoughDayRecord): TabWrite[] {
  return [
    {
      tab: DAY_TAB,
      row: {
        Date: record.date,
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
        'Forecast Rounding': '',
        'Batch Rounding': record.chosenBatchOption ?? '',
      },
    },
  ];
}

/** The EON save: ONE row of the final count and the night's sales. */
export function eonRecordToTabWrites(record: EonRecord): TabWrite[] {
  return [
    {
      tab: EON_TAB,
      row: {
        Date: record.date,
        'EON Sales': cellOf(record.finalSales),
        'EON Indi Count': cellOf(record.eonHave.indi),
        'EON Small Count': cellOf(record.eonHave.small),
        'EON Large Count': cellOf(record.eonHave.large),
        'EON Sic Count': cellOf(record.eonHave.sic),
        'EON Boli Count': cellOf(record.eonHave.boli),
      },
    },
  ];
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

/** 2 PM row → the tapped batch-rounding choice. */
export function summaryRowToRounding(row: SheetRow): 'down' | 'up' | null {
  const v = cell(row, 'Batch Rounding').toLowerCase();
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
  shortage: boolean;
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
        shortage: false,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export type { CountedInventory };
