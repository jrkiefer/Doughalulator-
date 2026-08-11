/**
 * Pure record → spreadsheet-row mapping. No I/O here — these functions turn
 * engine records into the exact rows each sheet tab expects, and back again
 * for loading. The Apps Script merges each row into its tab by Date, writing
 * ONLY the columns present in the payload. Blanks travel as EMPTY CELLS —
 * never fabricated zeros — and columns that depend on the tapped batch
 * choice stay blank until a choice exists.
 */
import type { AppConfig } from '../config';
import { defaultConfig } from '../config';
import type { AmUse, Bibles, CountedInventory, DoughDayRecord, EonRecord, Maybe } from '../core/types';

const ROUND_UP_AT = defaultConfig.bibleRounding.threshold;

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
export const PM_LOOKUP_TAB = 'Calculation Step Look up Dough Use for PM';
export const TOMORROW_LOOKUP_TAB = 'Calculation Step Look up Dough Use for Tomorrow';
export const MAKE_TAB = 'Calculation Step Dough Make (estimate)';
export const FINAL_MAKE_TAB = 'Final Make Amount';
export const AFTER_TAB = 'Estimated Dough Amount after Dough Gang';
export const AM_USE_TAB = 'AM Dough Use';
export const PM_USE_TAB = 'PM Dough Use';

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
        'Forecast Rounding': roundingFor(record.salesLeft),
        'Batch Rounding': record.chosenBatchOption ?? '',
      },
    },
    {
      tab: PM_LOOKUP_TAB,
      row: {
        Date: d,
        Bible: record.bibleUsed,
        'Forecast Rounding': roundingFor(record.salesLeft),
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
        'Forecast Rounding': roundingFor(record.tomorrowForecast),
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
        'Sic Balls': cellOf(record.sicBalls),
        'Sic Trays': cellOf(record.trays.sic),
        'Boli Trays': cellOf(record.boliTrays),
        'Batch Rounding': record.chosenBatchOption ?? '',
        'Trays Total': cellOf(record.totalTrays),
        Batches: chosen === null ? '' : chosen.batches,
      },
    },
  ];

  // The make and the resulting dough only exist once a choice has been tapped.
  if (chosen) {
    writes.push(
      {
        tab: FINAL_MAKE_TAB,
        row: {
          Date: d,
          'Indi Trays': cellOf(chosen.finalTraysToMake.indi),
          'Small Trays': cellOf(chosen.finalTraysToMake.small),
          'Large Trays': cellOf(chosen.finalTraysToMake.large),
          'Sic Balls': cellOf(record.sicBalls),
          'Boli Trays': cellOf(chosen.finalTraysToMake.boli),
        },
      },
      {
        tab: AFTER_TAB,
        row: {
          Date: d,
          Indi: cellOf(chosen.finalDough.indiTotal),
          Small: cellOf(chosen.finalDough.smallTotal),
          Large: cellOf(chosen.finalDough.largeTotal),
          Sic: cellOf(chosen.finalDough.sicTotal),
          Boli: cellOf(chosen.finalDough.boliTotal),
        },
      },
    );
  }

  if (amUse) {
    writes.push({
      tab: AM_USE_TAB,
      row: {
        Date: d,
        'AM Sales $': cellOf(amUse.sales),
        'AM Indi Use': cellOf(amUse.use.indi),
        'AM Small Use': cellOf(amUse.use.small),
        'AM Large Use': cellOf(amUse.use.large),
        'AM Sic Use': cellOf(amUse.use.sic),
        'Bible Used': record.bibleUsed,
      },
    });
  }

  return writes;
}

/** Everything the EON save writes: the final count, and what the night used. */
export function eonRecordToTabWrites(record: EonRecord, bible?: string): TabWrite[] {
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
        'EON Boli Count': cellOf(record.eonHave.boli),
      },
    },
  ];

  if (record.pmUse) {
    writes.push({
      tab: PM_USE_TAB,
      row: {
        Date: d,
        'PM Sales $': cellOf(record.pmSales),
        'PM Indi Use': cellOf(record.pmUse.indi),
        'PM Small Use': cellOf(record.pmUse.small),
        'PM Large Use': cellOf(record.pmUse.large),
        'PM Sic Use': cellOf(record.pmUse.sic),
        'Bible Used': bible ?? record.bibleUsed ?? '',
      },
    });
  }

  return writes;
}

/** Which way a bible lookup rounded — the same threshold rule the engine used. */
function roundingFor(sales: Maybe): string {
  if (sales === null || sales <= 0) return '';
  return sales >= ROUND_UP_AT ? 'up' : 'down';
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
