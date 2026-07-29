// Every tunable constant in the app lives here. Change numbers here, not in src/core.

export type SizeKey = 'indi' | 'small' | 'large' | 'sic' | 'boil';
export type BibleSizeKey = 'indi' | 'small' | 'large' | 'sic';
export type BibleId = 'regular' | 'peach';
export type RoundDirection = 'down' | 'up';

export interface BallsPerTray {
  indi: number;
  small: number;
  large: number;
  boil: number;
}

export interface SalesShorthandRule {
  /** Entered values at or below this are treated as thousands. */
  maxShorthand: number;
  multiplier: number;
}

export interface BibleRoundingRule {
  /** Sales at/above this use `atOrAbove`; below it use `below`. */
  threshold: number;
  below: RoundDirection;
  atOrAbove: RoundDirection;
}

export interface SeasonWindow {
  /** 'MM-DD', inclusive on both ends. */
  start: string;
  end: string;
}

export interface BatchAdjustSplit {
  small: number;
  large: number;
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
  /** Boil target: always bring the count up to this many trays. */
  boilTargetTrays: number;
  traysPerBatch: number;
  salesShorthand: SalesShorthandRule;
  bibleRounding: BibleRoundingRule;
  peachSeason: SeasonWindow;
  batchAdjustSplit: BatchAdjustSplit;
  bibleDisplayNames: Record<BibleId, string>;
  /** Stations in walking order for the temps page. */
  stations: string[];
  /** Temp slots: before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night. */
  tempSlots: TempSlotRules;
}

export const defaultConfig: AppConfig = {
  ballsPerTray: { indi: 11, small: 8, large: 6, boil: 6 },
  sicMakeTraySize: 3,
  boilTargetTrays: 6,
  traysPerBatch: 11,
  salesShorthand: { maxShorthand: 50, multiplier: 1000 },
  bibleRounding: { threshold: 10000, below: 'down', atOrAbove: 'up' },
  peachSeason: { start: '07-01', end: '08-31' },
  batchAdjustSplit: { small: 0.4, large: 0.6 },
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
