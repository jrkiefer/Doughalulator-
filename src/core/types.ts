import type { BibleId, BibleSizeKey, SizeKey } from '../config';

export type { BibleId, BibleSizeKey, SizeKey };

/** A value that may be "not entered / not knowable" — blank is never a zero. */
export type Maybe = number | null;

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
  boli: number;
}

/** A possibly-unknown number for each of the five sizes. */
export interface PerSizeMaybe {
  indi: Maybe;
  small: Maybe;
  large: Maybe;
  sic: Maybe;
  boli: Maybe;
}

/** A number for each of the four bible sizes (Boli is never in the bible). */
export interface PerBibleSize {
  indi: number;
  small: number;
  large: number;
  sic: number;
}

export interface PerBibleSizeMaybe {
  indi: Maybe;
  small: Maybe;
  large: Maybe;
  sic: Maybe;
}

/** Which sizes were actually counted (at least one of their fields entered). */
export interface CountedSizes {
  indi: boolean;
  small: boolean;
  large: boolean;
  sic: boolean;
  boli: boolean;
}

/**
 * What got physically counted. Sicilian is singles only — no trays in
 * inventory. `null` means the field was left blank (not counted); a typed 0
 * arrives as 0. Within a size that has ANY entered field, blank siblings
 * count as 0; a fully blank size is excluded from the math entirely.
 */
export interface CountedInventory {
  indiTrays: Maybe;
  indiSingles: Maybe;
  smallTrays: Maybe;
  smallSingles: Maybe;
  largeTrays: Maybe;
  largeSingles: Maybe;
  sicSingles: Maybe;
  boliTrays: Maybe;
  boliSingles: Maybe;
}

export interface DoughInputs {
  /** 'YYYY-MM-DD' — passed in, never read from the clock inside core. */
  date: string;
  counts: CountedInventory;
  /** null = blank field. A typed 0 is a real zero (for tomorrow: closed). */
  todayForecastRaw: Maybe;
  currentSalesRaw: Maybe;
  tomorrowForecastRaw: Maybe;
  /** Optional explicit bible choice; otherwise picked by date. */
  bibleOverride?: BibleId;
}

/** One of the two batch choices (round exactBatches down or up). */
export interface BatchOption {
  batches: number;
  /** batches × traysPerBatch. */
  targetTrays: number;
  /** targetTrays − totalTrays; absorbed by the counted of Small/Large at 40/60. */
  trayDelta: number;
  smallTrayDelta: number;
  largeTrayDelta: number;
  /** Trays to make after adjustment (sic in make-trays of 3; displayed as balls). Null = size not counted. */
  finalTraysToMake: PerSizeMaybe;
  /** Balls produced: trays × ballsPerTray; Sic = its balls-to-make unchanged. */
  ballsMade: PerSizeMaybe;
  finalDough: FinalDough;
}

/** Tomorrow-morning dough in count form. Null where the size wasn't counted. */
export interface FinalDough {
  indiTrays: Maybe;
  indiSingles: Maybe;
  indiTotal: Maybe;
  smallTrays: Maybe;
  smallSingles: Maybe;
  smallTotal: Maybe;
  largeTrays: Maybe;
  largeSingles: Maybe;
  largeTotal: Maybe;
  /** Sicilian is singles only: total only. */
  sicTotal: Maybe;
  boliTrays: Maybe;
  boliSingles: Maybe;
  boliTotal: Maybe;
}

export interface DoughDayRecord {
  date: string;
  // Sales — raw is what was typed (null = blank), plain number after shorthand expansion.
  todayForecastRaw: Maybe;
  todayForecast: Maybe;
  currentSalesRaw: Maybe;
  currentSales: Maybe;
  tomorrowForecastRaw: Maybe;
  tomorrowForecast: Maybe;
  /** today − current; null until both are typed. */
  salesLeft: Maybe;
  // Bible
  bibleUsed: BibleId;
  bibleName: string;
  /** Row used for tonight's use; null when salesLeft ≤ 0 or tonight unknown. */
  tonightRowMatched: BibleRow | null;
  /** Row for tomorrow's need; null when tomorrow is blank or the shop is closed tomorrow. */
  tomorrowRowMatched: BibleRow | null;
  // Counts
  counts: CountedInventory;
  countedSizes: CountedSizes;
  /** Balls on hand; null for a fully blank size. */
  have: PerSizeMaybe;
  // Tonight
  /** Bible use for tonight; null when tonight unknown or the size wasn't counted. */
  use: PerBibleSizeMaybe;
  /** have − use, NEGATIVES KEPT — a negative is real dough set out from tomorrow's stock. */
  left: PerBibleSizeMaybe;
  /** Shortfall to set out tonight, in whole trays of that size (0 when none). */
  setOutTrays: PerBibleSizeMaybe;
  /** The same shortfall in balls. */
  setOutBalls: PerBibleSizeMaybe;
  // Tomorrow
  /** Bible need; 0 everywhere when closed tomorrow; null when tomorrow is blank. */
  need: PerBibleSizeMaybe;
  /** Balls to make: max(0, need − left) — left may be negative, so set-out dough is replaced. */
  make: PerBibleSizeMaybe;
  /** Trays to make, rounded up (sic in make-trays of 3). */
  trays: PerBibleSizeMaybe;
  /** Sicilian is always displayed as balls. */
  sicBalls: Maybe;
  /** Boli trays to make toward the 36-ball target; null when Boli wasn't counted; 0 when closed tomorrow. */
  boliTrays: Maybe;
  // Batches — null until tonight AND tomorrow are known.
  totalTrays: Maybe;
  exactBatches: Maybe;
  /** Null when there is nothing to make (totalTrays 0 or unknown) — no batch choice is offered. */
  batchDown: BatchOption | null;
  batchUp: BatchOption | null;
  /** Owner taps up or down in the UI; the engine never picks. */
  chosenBatchOption: 'down' | 'up' | null;
  flags: {
    /** Tomorrow's forecast was explicitly typed as 0: the shop is closed tomorrow. */
    closedTomorrow: boolean;
    /** Current sales already past today's forecast; tonight's use forced to 0. */
    negativeSalesLeft: boolean;
    /** Boli fields were fully blank — excluded from top-up and batch math. */
    boliNotCounted: boolean;
    /** Sizes with a negative left — the set-out is primary; this stays as a "check your count" hint. */
    shortageSizes: BibleSizeKey[];
  };
}

export interface EonInputs {
  date: string;
  counts: CountedInventory;
  finalSalesRaw: Maybe;
  /** Only used when there is no day record; a typed 0 means closed tomorrow. */
  manualTomorrowForecastRaw?: Maybe;
  bibleOverride?: BibleId;
}

export interface EonRecord {
  date: string;
  counts: CountedInventory;
  countedSizes: CountedSizes;
  eonHave: PerSizeMaybe;
  finalSalesRaw: Maybe;
  finalSales: Maybe;
  /** finalSales − 2 PM current sales; null without both. */
  pmSales: Maybe;
  /**
   * Dough used after 2 PM: the night's final dough − the EON count, per size.
   * Needs a day record with a tapped batch choice; a negative means a
   * miscount rather than a real figure, so it is left null.
   */
  pmUse: PerSizeMaybe | null;
  // Tomorrow check — all five sizes; Boli checks against its 36-ball target.
  needSource: 'dayRecord' | 'manualForecast' | null;
  manualTomorrowForecastRaw: Maybe;
  manualTomorrowForecast: Maybe;
  /** Set only on the manual-forecast path (the day record already carries its own). */
  bibleUsed: BibleId | null;
  bibleName: string | null;
  tomorrowRowMatched: BibleRow | null;
  need: PerBibleSizeMaybe | null;
  /** Boli's need in balls: 0 when closed tomorrow, else the 36-ball target. */
  boliNeed: Maybe;
  eonLeft: PerBibleSizeMaybe | null;
  boliLeft: Maybe;
  /** Per size, trays short rounded up when eonLeft is negative; 0 otherwise. */
  traysShort: PerBibleSizeMaybe | null;
  boliTraysShort: Maybe;
  /** Sicilian shortage also shown as balls. */
  sicBallsShort: Maybe;
  flags: {
    tomorrowCheckAvailable: boolean;
    closedTomorrow: boolean;
  };
}

/** Dough used before 2 PM: yesterday's close − this afternoon's count. */
export interface AmUse {
  sales: Maybe;
  use: PerSizeMaybe;
}
