// Every tunable constant in the app lives here. Change numbers here, not in src/core.

export type SizeKey = 'indi' | 'small' | 'large' | 'sic' | 'boli';
export type BibleSizeKey = 'indi' | 'small' | 'large' | 'sic';
export type BibleId = 'regular' | 'peach';
export type RoundDirection = 'down' | 'up';

export interface BallsPerTray {
  indi: number;
  small: number;
  large: number;
  boli: number;
}

export interface SalesShorthandRule {
  /** Entered values BELOW this are treated as thousands (100 stays $100). */
  under: number;
  multiplier: number;
}

export interface BibleRoundingRule {
  /** A slow day is both forecasts entered and both strictly under this. */
  slowDayUnder: number;
  /** On a slow day, never round a lookup down by more than this many dollars. */
  maxRoundDownGap: number;
}

export interface BatchRoundingRule {
  /** Trays past a whole batch that round DOWN on any day. */
  downMaxOverAnyDay: number;
  /** …widened to this on a slow day. */
  downMaxOverSlowDay: number;
}

export interface SicMinimumRule {
  /** Never make fewer than this many Sicilian… */
  make: number;
  /** …unless this many are already on hand. */
  waiverAt: number;
}

export interface SeasonWindow {
  /** 'MM-DD', inclusive on both ends. */
  start: string;
  end: string;
}

export interface BatchAdjustSplit {
  /** Large's share of a tray adjustment, rounded UP so Large is always ahead. */
  largeShare: number;
}

export interface TempSlotRules {
  /** Clock times strictly before this 'HH:MM' fall in the morning slot. */
  morningBefore: string;
  /** Clock times strictly after this 'HH:MM' fall in the night slot; everything between is the midday slot. */
  nightAfter: string;
  names: { morning: string; midday: string; night: string };
}

export interface AppConfig {
  ballsPerTray: BallsPerTray;
  /** Sicilian is counted/made in singles; one make-tray holds this many balls. */
  sicMakeTraySize: number;
  /** Boli target: always bring the count up to this many trays. */
  boliTargetTrays: number;
  traysPerBatch: number;
  salesShorthand: SalesShorthandRule;
  bibleRounding: BibleRoundingRule;
  batchRounding: BatchRoundingRule;
  sicMinimum: SicMinimumRule;
  peachSeason: SeasonWindow;
  batchAdjustSplit: BatchAdjustSplit;
  bibleDisplayNames: Record<BibleId, string>;
  /** Stations in walking order for the temps page. */
  stations: string[];
  /** Temp slots: before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night. */
  tempSlots: TempSlotRules;
}

export const defaultConfig: AppConfig = {
  ballsPerTray: { indi: 11, small: 8, large: 6, boli: 6 },
  sicMakeTraySize: 3,
  boliTargetTrays: 6,
  traysPerBatch: 11,
  salesShorthand: { under: 100, multiplier: 1000 },
  bibleRounding: { slowDayUnder: 13000, maxRoundDownGap: 400 },
  batchRounding: { downMaxOverAnyDay: 2, downMaxOverSlowDay: 5 },
  sicMinimum: { make: 1, waiverAt: 8 },
  peachSeason: { start: '07-01', end: '08-31' },
  batchAdjustSplit: { largeShare: 0.6 },
  bibleDisplayNames: { regular: "Bible '26", peach: "Peach '24" },
  stations: [
    'Pizza 1',
    'Pizza Lowboy',
    'Pizza 2',
    'Slice',
    'Salad',
    'Reach-In',
    'Walk-In',
    'Freezer',
  ],
  tempSlots: {
    morningBefore: '11:00',
    nightAfter: '17:00',
    names: { morning: 'Morning', midday: '2 PM', night: 'Night' },
  },
};
