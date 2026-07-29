import type { BibleId, BibleSizeKey, SizeKey } from '../config';

export type { BibleId, BibleSizeKey, SizeKey };

/** One bible row: dough needed per size for a given sales level. */
export interface BibleRow {
  sales: number;
  indi: number;
  small: number;
  large: number;
  sic: number;
  /** Reference-only columns on peach rows; the engine ignores them. */
  trays?: number;
  batches?: number;
}

export interface Bible {
  name: string;
  season: { start: string; end: string };
  notes: string;
  rows: BibleRow[];
}

export interface Bibles {
  regular: Bible;
  peach: Bible;
}

/** A number for each of the five sizes. */
export interface PerSize {
  indi: number;
  small: number;
  large: number;
  sic: number;
  boil: number;
}

/** A number for each of the four bible sizes (Boil is never in the bible). */
export interface PerBibleSize {
  indi: number;
  small: number;
  large: number;
  sic: number;
}

/** What got physically counted. Sicilian is singles only — no trays in inventory. */
export interface CountedInventory {
  indiTrays: number;
  indiSingles: number;
  smallTrays: number;
  smallSingles: number;
  largeTrays: number;
  largeSingles: number;
  sicSingles: number;
  boilTrays: number;
  boilSingles: number;
}

export interface DoughInputs {
  /** 'YYYY-MM-DD' — passed in, never read from the clock inside core. */
  date: string;
  counts: CountedInventory;
  todayForecastRaw: number;
  currentSalesRaw: number;
  tomorrowForecastRaw: number;
  /** Optional explicit bible choice; otherwise picked by date. */
  bibleOverride?: BibleId;
}

/** One of the two batch choices (round exactBatches down or up). */
export interface BatchOption {
  batches: number;
  /** batches × traysPerBatch. */
  targetTrays: number;
  /** targetTrays − totalTrays; absorbed by Small and Large at 40/60. */
  trayDelta: number;
  smallTrayDelta: number;
  largeTrayDelta: number;
  /** Trays to make after adjustment (sic in make-trays of 3; displayed as balls). */
  finalTraysToMake: PerSize;
  /** Balls produced: trays × ballsPerTray; Sic = its balls-to-make unchanged. */
  ballsMade: PerSize;
  finalDough: FinalDough;
}

/** Tomorrow-morning dough in count form: trays = counted + made, singles unchanged, total = have + ballsMade. */
export interface FinalDough {
  indiTrays: number;
  indiSingles: number;
  indiTotal: number;
  smallTrays: number;
  smallSingles: number;
  smallTotal: number;
  largeTrays: number;
  largeSingles: number;
  largeTotal: number;
  /** Sicilian is singles only: total only. */
  sicTotal: number;
  boilTrays: number;
  boilSingles: number;
  boilTotal: number;
}

export interface DoughDayRecord {
  date: string;
  // Sales — raw is what was typed, the plain number is after shorthand expansion.
  todayForecastRaw: number;
  todayForecast: number;
  currentSalesRaw: number;
  currentSales: number;
  tomorrowForecastRaw: number;
  tomorrowForecast: number;
  salesLeft: number;
  // Bible
  bibleUsed: BibleId;
  bibleName: string;
  /** Row used for tonight's use; null when salesLeft ≤ 0 (use forced to 0). */
  tonightRowMatched: BibleRow | null;
  tomorrowRowMatched: BibleRow;
  // Counts
  counts: CountedInventory;
  have: PerSize;
  // Tonight
  use: PerBibleSize;
  /** have − use before clamping; a negative here is a shortage warning. */
  leftRaw: PerBibleSize;
  left: PerBibleSize;
  // Tomorrow
  need: PerBibleSize;
  /** Balls to make: max(0, need − left). */
  make: PerBibleSize;
  /** Trays to make, rounded up (sic in make-trays of 3). */
  trays: PerBibleSize;
  /** Sicilian is always displayed as balls. */
  sicBalls: number;
  /** Boil trays to make: max(0, boilTargetTrays − boil trays counted). */
  boilTrays: number;
  // Batches
  totalTrays: number;
  exactBatches: number;
  batchDown: BatchOption;
  batchUp: BatchOption;
  /** Owner taps up or down in the UI; the engine never picks. */
  chosenBatchOption: 'down' | 'up' | null;
  flags: {
    /** Current sales already past today's forecast; tonight's use forced to 0. */
    negativeSalesLeft: boolean;
    /** Sizes where have − use went negative (not enough dough for tonight). */
    shortageSizes: BibleSizeKey[];
  };
}

export interface EonInputs {
  date: string;
  counts: CountedInventory;
  finalSalesRaw: number;
  /** Only used when there is no day record; triggers a fresh bible lookup. */
  manualTomorrowForecastRaw?: number;
  bibleOverride?: BibleId;
}

export interface EonRecord {
  date: string;
  counts: CountedInventory;
  eonHave: PerSize;
  finalSalesRaw: number;
  finalSales: number;
  /** finalSales − 2 PM current sales; null without a day record. */
  pmSales: number | null;
  // Tomorrow check (Indi/Small/Large/Sic only — never Boil)
  needSource: 'dayRecord' | 'manualForecast' | null;
  manualTomorrowForecastRaw: number | null;
  manualTomorrowForecast: number | null;
  /** Set only on the manual-forecast path (the day record already carries its own). */
  bibleUsed: BibleId | null;
  bibleName: string | null;
  tomorrowRowMatched: BibleRow | null;
  need: PerBibleSize | null;
  eonLeft: PerBibleSize | null;
  /** Per size, trays short rounded up when eonLeft is negative; 0 otherwise. */
  traysShort: PerBibleSize | null;
  /** Sicilian shortage also shown as balls. */
  sicBallsShort: number | null;
  // PM use (all five sizes; negatives pass through — they mean "check count?")
  pmUse: PerSize | null;
  flags: {
    pmSalesAvailable: boolean;
    tomorrowCheckAvailable: boolean;
    pmUseAvailable: boolean;
    /** Sizes where pmUse came out negative (probable miscount). */
    negativePmUseSizes: SizeKey[];
  };
}

export interface AmUseResult {
  /** Sales rung up so far today (the 2 PM current-sales figure, expanded). */
  amSales: number;
  /** Yesterday's end-of-night dough minus this morning's count, all five sizes. */
  amUse: PerSize;
}
