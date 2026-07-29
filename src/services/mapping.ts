/**
 * Pure record → spreadsheet-row mapping. No I/O here — these functions turn
 * engine records into the exact rows each sheet tab expects, and back again
 * for loading. The Apps Script merges each row into its tab by Date, writing
 * ONLY the columns present in the payload (so a 2 PM save never blanks EON
 * columns and vice versa).
 */
import type { AppConfig } from '../config';
import type {
  AmUseResult,
  Bibles,
  CountedInventory,
  DoughDayRecord,
  EonRecord,
  PerSize,
} from '../core/types';

/** One tab's worth of a save: the row is merged into the tab by Date. */
export interface TabWrite {
  tab: string;
  row: Record<string, string | number>;
}

const SIZE_LABELS = { indi: 'Indi', small: 'Small', large: 'Large', sic: 'Sic' } as const;

function chosenOption(record: DoughDayRecord) {
  if (!record.chosenBatchOption) {
    throw new Error('day record has no chosen batch option yet');
  }
  return record.chosenBatchOption === 'down' ? record.batchDown : record.batchUp;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Everything the 2 PM save writes. AM columns ride along when AM use exists. */
export function dayRecordToTabWrites(
  record: DoughDayRecord,
  amUse: AmUseResult | null,
): TabWrite[] {
  const d = record.date;
  const opt = chosenOption(record);
  const c = record.counts;

  const shortages = record.flags.shortageSizes
    .map((size) => `${SIZE_LABELS[size]} ${record.leftRaw[size]}`)
    .join(', ');

  const tonightMatched = record.tonightRowMatched
    ? record.tonightRowMatched.sales
    : record.flags.negativeSalesLeft
      ? '0 — flagged'
      : '0';

  const writes: TabWrite[] = [
    {
      tab: 'Summary',
      row: {
        Date: d,
        'Bible Used': record.bibleName,
        'Forecast Tonight $': record.todayForecast,
        'Current Sales $': record.currentSales,
        'Sales Left $': record.salesLeft,
        'Forecast Tomorrow $': record.tomorrowForecast,
        'Total Trays To Make': record.totalTrays,
        'Exact Batches': round2(record.exactBatches),
        'Chosen (Up/Down)': record.chosenBatchOption === 'up' ? 'Up' : 'Down',
        'Batches Made': opt.batches,
        'Shortage?': record.flags.shortageSizes.map((s) => SIZE_LABELS[s]).join(', '),
      },
    },
    {
      tab: 'Dough Count',
      row: {
        Date: d,
        'Indi Trays': c.indiTrays,
        'Indi Singles': c.indiSingles,
        'Indi Have': record.have.indi,
        'Small Trays': c.smallTrays,
        'Small Singles': c.smallSingles,
        'Small Have': record.have.small,
        'Large Trays': c.largeTrays,
        'Large Singles': c.largeSingles,
        'Large Have': record.have.large,
        'Sic Have': record.have.sic,
        'Boil Trays': c.boilTrays,
        'Boil Singles': c.boilSingles,
        'Boil Have': record.have.boil,
      },
    },
    {
      tab: 'Sales',
      row: {
        Date: d,
        'Forecast Tonight (entered)': record.todayForecastRaw,
        'Forecast Tonight $': record.todayForecast,
        'Current Sales (entered)': record.currentSalesRaw,
        'Current Sales $': record.currentSales,
        'Sales Left $': record.salesLeft,
        'Forecast Tomorrow (entered)': record.tomorrowForecastRaw,
        'Forecast Tomorrow $': record.tomorrowForecast,
        'Bible Used': record.bibleName,
        'Bible Row Matched Tonight': tonightMatched,
        'Bible Row Matched Tomorrow': record.tomorrowRowMatched.sales,
      },
    },
    {
      tab: 'Use Tonight',
      row: {
        Date: d,
        Indi: record.use.indi,
        Small: record.use.small,
        Large: record.use.large,
        Sic: record.use.sic,
      },
    },
    {
      tab: 'Left',
      row: {
        Date: d,
        Indi: record.left.indi,
        Small: record.left.small,
        Large: record.left.large,
        Sic: record.left.sic,
        Shortages: shortages,
      },
    },
    {
      tab: 'Need Tomorrow',
      row: {
        Date: d,
        Indi: record.need.indi,
        Small: record.need.small,
        Large: record.need.large,
        Sic: record.need.sic,
      },
    },
    {
      tab: 'Make',
      row: {
        Date: d,
        'Indi Balls': record.make.indi,
        'Indi Trays': record.trays.indi,
        'Small Balls': record.make.small,
        'Small Trays': record.trays.small,
        'Large Balls': record.make.large,
        'Large Trays': record.trays.large,
        'Sic Balls': record.sicBalls,
        'Sic Trays': record.trays.sic,
        'Boil Trays': record.boilTrays,
      },
    },
    {
      tab: 'Batches',
      row: {
        Date: d,
        'Total Trays': record.totalTrays,
        Batches: opt.batches,
        'Rounded (Up/Down)': record.chosenBatchOption === 'up' ? 'Up' : 'Down',
        Indi: opt.finalTraysToMake.indi,
        Small: opt.finalTraysToMake.small,
        Large: opt.finalTraysToMake.large,
        Sic: opt.finalTraysToMake.sic,
        Boil: opt.finalTraysToMake.boil,
      },
    },
    {
      tab: 'Final Dough',
      row: {
        Date: d,
        'Indi Trays': opt.finalDough.indiTrays,
        'Indi Singles': opt.finalDough.indiSingles,
        'Indi Final': opt.finalDough.indiTotal,
        'Small Trays': opt.finalDough.smallTrays,
        'Small Singles': opt.finalDough.smallSingles,
        'Small Final': opt.finalDough.smallTotal,
        'Large Trays': opt.finalDough.largeTrays,
        'Large Singles': opt.finalDough.largeSingles,
        'Large Final': opt.finalDough.largeTotal,
        'Sic Final': opt.finalDough.sicTotal,
        'Boil Trays': opt.finalDough.boilTrays,
        'Boil Singles': opt.finalDough.boilSingles,
        'Boil Final': opt.finalDough.boilTotal,
      },
    },
  ];

  // Actual Use, AM half — the EON save fills the PM half of the same row later.
  const actualUse: TabWrite = { tab: 'Actual Use', row: { Date: d } };
  if (amUse) {
    actualUse.row['AM Sales $'] = amUse.amSales;
    actualUse.row['AM Indi'] = amUse.amUse.indi;
    actualUse.row['AM Small'] = amUse.amUse.small;
    actualUse.row['AM Large'] = amUse.amUse.large;
    actualUse.row['AM Sic'] = amUse.amUse.sic;
    actualUse.row['AM Boil'] = amUse.amUse.boil;
  }
  writes.push(actualUse);

  return writes;
}

/** Everything the EON save writes. */
export function eonRecordToTabWrites(record: EonRecord): TabWrite[] {
  const d = record.date;
  const c = record.counts;

  const writes: TabWrite[] = [
    {
      tab: 'EON Count',
      row: {
        Date: d,
        'Indi Trays': c.indiTrays,
        'Indi Singles': c.indiSingles,
        'Indi Have': record.eonHave.indi,
        'Small Trays': c.smallTrays,
        'Small Singles': c.smallSingles,
        'Small Have': record.eonHave.small,
        'Large Trays': c.largeTrays,
        'Large Singles': c.largeSingles,
        'Large Have': record.eonHave.large,
        'Sic Have': record.eonHave.sic,
        'Boil Trays': c.boilTrays,
        'Boil Singles': c.boilSingles,
        'Boil Have': record.eonHave.boil,
        'Final Sales (entered)': record.finalSalesRaw,
        'Final Sales $': record.finalSales,
      },
    },
  ];

  if (record.eonLeft && record.traysShort) {
    const shortText = (['indi', 'small', 'large', 'sic'] as const)
      .filter((size) => record.traysShort![size] > 0)
      .map((size) => `${SIZE_LABELS[size]} ${record.traysShort![size]}`)
      .join(', ');
    writes.push({
      tab: 'EON Check',
      row: {
        Date: d,
        Indi: record.eonLeft.indi,
        Small: record.eonLeft.small,
        Large: record.eonLeft.large,
        Sic: record.eonLeft.sic,
        'Trays Short': shortText,
      },
    });
  }

  // Actual Use, PM half.
  const actualUse: TabWrite = { tab: 'Actual Use', row: { Date: d } };
  if (record.pmSales !== null) {
    actualUse.row['PM Sales $'] = record.pmSales;
  }
  if (record.pmUse) {
    actualUse.row['PM Indi'] = record.pmUse.indi;
    actualUse.row['PM Small'] = record.pmUse.small;
    actualUse.row['PM Large'] = record.pmUse.large;
    actualUse.row['PM Sic'] = record.pmUse.sic;
    actualUse.row['PM Boil'] = record.pmUse.boil;
  }
  writes.push(actualUse);

  return writes;
}

/** Deterministic content hash (FNV-1a) so the script only rewrites the bible mirror tabs when the data changed. */
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

function cell(row: SheetRow, key: string): string {
  const v = row[key];
  return v === undefined || v === null ? '' : String(v);
}

/** Sheet "Dough Count" / "EON Count" row → the nine count-field strings. */
export function countsRowToFields(row: SheetRow): Record<string, string> {
  return {
    indiTrays: cell(row, 'Indi Trays'),
    indiSingles: cell(row, 'Indi Singles'),
    smallTrays: cell(row, 'Small Trays'),
    smallSingles: cell(row, 'Small Singles'),
    largeTrays: cell(row, 'Large Trays'),
    largeSingles: cell(row, 'Large Singles'),
    sicSingles: cell(row, 'Sic Have'),
    boilTrays: cell(row, 'Boil Trays'),
    boilSingles: cell(row, 'Boil Singles'),
  };
}

/** Sheet "Sales" row → the three raw entered sales strings. */
export function salesRowToFields(row: SheetRow): {
  todayForecast: string;
  currentSales: string;
  tomorrowForecast: string;
} {
  return {
    todayForecast: cell(row, 'Forecast Tonight (entered)'),
    currentSales: cell(row, 'Current Sales (entered)'),
    tomorrowForecast: cell(row, 'Forecast Tomorrow (entered)'),
  };
}

/** Sheet "Summary" row → the tapped rounding choice. */
export function summaryRowToRounding(row: SheetRow): 'down' | 'up' | null {
  const v = cell(row, 'Chosen (Up/Down)').toLowerCase();
  return v === 'up' ? 'up' : v === 'down' ? 'down' : null;
}

/** Sheet "EON Count" row → end-of-night balls on hand (for the AM-use math). */
export function eonCountRowToHave(row: SheetRow): PerSize | null {
  // A blank cell is missing data, not a zero — '' must not coerce to 0.
  const n = (key: string) => {
    const s = cell(row, key).trim();
    return s === '' ? NaN : Number(s);
  };
  const have = {
    indi: n('Indi Have'),
    small: n('Small Have'),
    large: n('Large Have'),
    sic: n('Sic Have'),
    boil: n('Boil Have'),
  };
  return Object.values(have).every(Number.isFinite) ? have : null;
}

/** Sheet "EON Count" row → the EON form's final-sales string. */
export function eonCountRowToFinalSales(row: SheetRow): string {
  return cell(row, 'Final Sales (entered)');
}

export type { CountedInventory };
