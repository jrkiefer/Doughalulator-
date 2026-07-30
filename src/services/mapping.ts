/**
 * Pure record → spreadsheet-row mapping. No I/O here — these functions turn
 * engine records into the exact rows each sheet tab expects, and back again
 * for loading. The Apps Script merges each row into its tab by Date, writing
 * ONLY the columns present in the payload. Blanks travel as EMPTY CELLS —
 * never fabricated zeros — and columns that depend on the tapped batch
 * choice stay blank until a choice exists.
 */
import type { AppConfig } from '../config';
import type {
  Bibles,
  CountedInventory,
  DoughDayRecord,
  EonRecord,
  Maybe,
  PerSize,
} from '../core/types';

/** One tab's worth of a save: the row is merged into the tab by Date. */
export interface TabWrite {
  tab: string;
  row: Record<string, string | number>;
}

const SIZE_LABELS = { indi: 'Indi', small: 'Small', large: 'Large', sic: 'Sic', boli: 'Boli' } as const;

/** Blank cell for unknowns — the sheet mirrors "not entered", never a fake 0. */
function cellOf(value: Maybe): string | number {
  return value === null ? '' : value;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Everything the 2 PM save writes. */
export function dayRecordToTabWrites(record: DoughDayRecord): TabWrite[] {
  const d = record.date;
  const chosen =
    record.chosenBatchOption === null
      ? null
      : record.chosenBatchOption === 'down'
        ? record.batchDown
        : record.batchUp;
  const c = record.counts;

  const shortages = record.flags.shortageSizes
    .map((size) => `${SIZE_LABELS[size]} ${record.left[size]}`)
    .join(', ');

  const tonightMatched =
    record.salesLeft === null
      ? ''
      : record.tonightRowMatched
        ? record.tonightRowMatched.sales
        : record.flags.negativeSalesLeft
          ? '0 — flagged'
          : '0';

  const tomorrowMatched =
    record.tomorrowForecast === null
      ? ''
      : record.flags.closedTomorrow
        ? 'Closed'
        : (record.tomorrowRowMatched?.sales ?? '');

  const writes: TabWrite[] = [
    {
      tab: 'Summary',
      row: {
        Date: d,
        'Bible Used': record.bibleName,
        'Forecast Tonight $': cellOf(record.todayForecast),
        'Current Sales $': cellOf(record.currentSales),
        'Sales Left $': cellOf(record.salesLeft),
        'Forecast Tomorrow $': cellOf(record.tomorrowForecast),
        'Total Trays To Make': cellOf(record.totalTrays),
        'Exact Batches': record.exactBatches === null ? '' : round2(record.exactBatches),
        'Chosen (Up/Down)':
          record.chosenBatchOption === null ? '' : record.chosenBatchOption === 'up' ? 'Up' : 'Down',
        'Batches Made': chosen === null ? '' : chosen.batches,
        'Shortage?': record.flags.shortageSizes.map((s) => SIZE_LABELS[s]).join(', '),
      },
    },
    {
      tab: 'Dough Count',
      row: {
        Date: d,
        'Indi Trays': cellOf(c.indiTrays),
        'Indi Singles': cellOf(c.indiSingles),
        'Indi Have': cellOf(record.have.indi),
        'Small Trays': cellOf(c.smallTrays),
        'Small Singles': cellOf(c.smallSingles),
        'Small Have': cellOf(record.have.small),
        'Large Trays': cellOf(c.largeTrays),
        'Large Singles': cellOf(c.largeSingles),
        'Large Have': cellOf(record.have.large),
        'Sic Have': cellOf(record.have.sic),
        'Boli Trays': cellOf(c.boliTrays),
        'Boli Singles': cellOf(c.boliSingles),
        'Boli Have': cellOf(record.have.boli),
      },
    },
    {
      tab: 'Sales',
      row: {
        Date: d,
        'Forecast Tonight (entered)': cellOf(record.todayForecastRaw),
        'Forecast Tonight $': cellOf(record.todayForecast),
        'Current Sales (entered)': cellOf(record.currentSalesRaw),
        'Current Sales $': cellOf(record.currentSales),
        'Sales Left $': cellOf(record.salesLeft),
        'Forecast Tomorrow (entered)': cellOf(record.tomorrowForecastRaw),
        'Forecast Tomorrow $': cellOf(record.tomorrowForecast),
        'Bible Used': record.bibleName,
        'Bible Row Matched Tonight': tonightMatched,
        'Bible Row Matched Tomorrow': tomorrowMatched,
      },
    },
    {
      tab: 'Use Tonight',
      row: {
        Date: d,
        Indi: cellOf(record.use.indi),
        Small: cellOf(record.use.small),
        Large: cellOf(record.use.large),
        Sic: cellOf(record.use.sic),
      },
    },
    {
      tab: 'Left',
      row: {
        Date: d,
        Indi: cellOf(record.left.indi),
        Small: cellOf(record.left.small),
        Large: cellOf(record.left.large),
        Sic: cellOf(record.left.sic),
        Shortages: shortages,
      },
    },
    {
      tab: 'Need Tomorrow',
      row: {
        Date: d,
        Indi: cellOf(record.need.indi),
        Small: cellOf(record.need.small),
        Large: cellOf(record.need.large),
        Sic: cellOf(record.need.sic),
      },
    },
    {
      tab: 'Make',
      row: {
        Date: d,
        'Indi Balls': cellOf(record.make.indi),
        'Indi Trays': cellOf(record.trays.indi),
        'Small Balls': cellOf(record.make.small),
        'Small Trays': cellOf(record.trays.small),
        'Large Balls': cellOf(record.make.large),
        'Large Trays': cellOf(record.trays.large),
        'Sic Balls': cellOf(record.sicBalls),
        'Sic Trays': cellOf(record.trays.sic),
        'Boli Trays': cellOf(record.boliTrays),
      },
    },
  ];

  // Batches and Final Dough exist only once the owner has tapped a choice.
  if (chosen) {
    writes.push(
      {
        tab: 'Batches',
        row: {
          Date: d,
          'Total Trays': cellOf(record.totalTrays),
          Batches: chosen.batches,
          'Rounded (Up/Down)': record.chosenBatchOption === 'up' ? 'Up' : 'Down',
          Indi: cellOf(chosen.finalTraysToMake.indi),
          Small: cellOf(chosen.finalTraysToMake.small),
          Large: cellOf(chosen.finalTraysToMake.large),
          Sic: cellOf(chosen.finalTraysToMake.sic),
          Boli: cellOf(chosen.finalTraysToMake.boli),
        },
      },
      {
        tab: 'Final Dough',
        row: {
          Date: d,
          'Indi Trays': cellOf(chosen.finalDough.indiTrays),
          'Indi Singles': cellOf(chosen.finalDough.indiSingles),
          'Indi Final': cellOf(chosen.finalDough.indiTotal),
          'Small Trays': cellOf(chosen.finalDough.smallTrays),
          'Small Singles': cellOf(chosen.finalDough.smallSingles),
          'Small Final': cellOf(chosen.finalDough.smallTotal),
          'Large Trays': cellOf(chosen.finalDough.largeTrays),
          'Large Singles': cellOf(chosen.finalDough.largeSingles),
          'Large Final': cellOf(chosen.finalDough.largeTotal),
          'Sic Final': cellOf(chosen.finalDough.sicTotal),
          'Boli Trays': cellOf(chosen.finalDough.boliTrays),
          'Boli Singles': cellOf(chosen.finalDough.boliSingles),
          'Boli Final': cellOf(chosen.finalDough.boliTotal),
        },
      },
    );
  }

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
        'Indi Trays': cellOf(c.indiTrays),
        'Indi Singles': cellOf(c.indiSingles),
        'Indi Have': cellOf(record.eonHave.indi),
        'Small Trays': cellOf(c.smallTrays),
        'Small Singles': cellOf(c.smallSingles),
        'Small Have': cellOf(record.eonHave.small),
        'Large Trays': cellOf(c.largeTrays),
        'Large Singles': cellOf(c.largeSingles),
        'Large Have': cellOf(record.eonHave.large),
        'Sic Have': cellOf(record.eonHave.sic),
        'Boli Trays': cellOf(c.boliTrays),
        'Boli Singles': cellOf(c.boliSingles),
        'Boli Have': cellOf(record.eonHave.boli),
        'Final Sales (entered)': cellOf(record.finalSalesRaw),
        'Final Sales $': cellOf(record.finalSales),
      },
    },
  ];

  if (record.eonLeft && record.traysShort) {
    const shortParts = (['indi', 'small', 'large', 'sic'] as const)
      .filter((size) => (record.traysShort![size] ?? 0) > 0)
      .map((size) => `${SIZE_LABELS[size]} ${record.traysShort![size]}`);
    if ((record.boliTraysShort ?? 0) > 0) shortParts.push(`Boli ${record.boliTraysShort}`);
    writes.push({
      tab: 'EON Check',
      row: {
        Date: d,
        Indi: cellOf(record.eonLeft.indi),
        Small: cellOf(record.eonLeft.small),
        Large: cellOf(record.eonLeft.large),
        Sic: cellOf(record.eonLeft.sic),
        Boli: cellOf(record.boliLeft),
        'Trays Short': shortParts.join(', '),
      },
    });
  }

  return writes;
}

/** Deterministic content hash (FNV-1a) — used for the bible-mirror gate and payload dedupe. */
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
    boliTrays: cell(row, 'Boli Trays'),
    boliSingles: cell(row, 'Boli Singles'),
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

/** Sheet "Sales" row → which bible the record used (display name → id). */
export function salesRowToBible(row: SheetRow, config: AppConfig): 'regular' | 'peach' | null {
  const name = cell(row, 'Bible Used');
  if (name === config.bibleDisplayNames.regular) return 'regular';
  if (name === config.bibleDisplayNames.peach) return 'peach';
  return null;
}

/** Sheet "Summary" row → the tapped rounding choice. */
export function summaryRowToRounding(row: SheetRow): 'down' | 'up' | null {
  const v = cell(row, 'Chosen (Up/Down)').toLowerCase();
  return v === 'up' ? 'up' : v === 'down' ? 'down' : null;
}

/** Sheet "EON Count" row → end-of-night balls on hand (for reference displays). */
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
    boli: n('Boli Have'),
  };
  return Object.values(have).every(Number.isFinite) ? have : null;
}

/** Sheet "EON Count" row → the EON form's final-sales string. */
export function eonCountRowToFinalSales(row: SheetRow): string {
  return cell(row, 'Final Sales (entered)');
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
    .map(([date, tabs]) => ({
      date,
      finalSales: tabs['EON Count'] ? cell(tabs['EON Count'], 'Final Sales $') : '',
      batchesMade: tabs['Summary'] ? cell(tabs['Summary'], 'Batches Made') : '',
      shortage: tabs['Summary'] ? cell(tabs['Summary'], 'Shortage?') !== '' : false,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export type { CountedInventory };
