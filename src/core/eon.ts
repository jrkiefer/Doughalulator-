import type { AppConfig } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeCountedSizes, computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  AmUse,
  Bibles,
  DoughDayRecord,
  EonInputs,
  EonRecord,
  Maybe,
  PerBibleSizeMaybe,
  PerSizeMaybe,
} from './types';

/** Trays short, rounded up, for one size's shortfall (a non-negative number of balls). */
function traysShortFor(shortBalls: number, perTray: number): number {
  return Math.ceil(shortBalls / perTray);
}

/**
 * The end-of-night calculation. Works with or without the day's 2 PM record:
 * without one, a manually-entered tomorrow forecast can stand in for the day
 * record's need (a manual 0 = closed tomorrow, zero need everywhere). The
 * tomorrow check covers all five sizes — Boli against its 36-ball target.
 */
export function runEonCalculation(
  eonInputs: EonInputs,
  dayRecord: DoughDayRecord | null,
  bibles: Bibles,
  config: AppConfig,
): EonRecord {
  const bpt = config.ballsPerTray;
  const norm = (raw: Maybe): Maybe =>
    raw === null ? null : normalizeSales(raw, config.salesShorthand);

  const countedSizes = computeCountedSizes(eonInputs.counts);
  const eonHave = computeHave(eonInputs.counts, config);
  const finalSales = norm(eonInputs.finalSalesRaw);

  const pmSales =
    finalSales !== null && dayRecord !== null && dayRecord.currentSales !== null
      ? finalSales - dayRecord.currentSales
      : null;

  // What the night got through: the dough standing after the make, less what
  // was counted at close. Only knowable once a batch choice has been tapped.
  const chosen =
    dayRecord === null || dayRecord.chosenBatchOption === null
      ? null
      : dayRecord.chosenBatchOption === 'down'
        ? dayRecord.batchDown
        : dayRecord.batchUp;
  const pmUse: PerSizeMaybe | null = chosen
    ? {
        indi: usedSince(chosen.finalDough.indiTotal, eonHave.indi),
        small: usedSince(chosen.finalDough.smallTotal, eonHave.small),
        large: usedSince(chosen.finalDough.largeTotal, eonHave.large),
        sic: usedSince(chosen.finalDough.sicTotal, eonHave.sic),
        boli: usedSince(chosen.finalDough.boliTotal, eonHave.boli),
      }
    : null;

  // Where tomorrow's need comes from: the day record, or a manual forecast lookup.
  let needSource: EonRecord['needSource'] = null;
  let need: PerBibleSizeMaybe | null = null;
  let closedTomorrow = false;
  const manualRaw = eonInputs.manualTomorrowForecastRaw ?? null;
  let manualTomorrowForecast: Maybe = null;
  let bibleUsed: EonRecord['bibleUsed'] = null;
  let bibleName: string | null = null;
  let tomorrowRowMatched: EonRecord['tomorrowRowMatched'] = null;

  if (dayRecord && dayRecord.tomorrowForecast !== null) {
    needSource = 'dayRecord';
    need = dayRecord.need;
    closedTomorrow = dayRecord.flags.closedTomorrow;
  } else if (manualRaw !== null) {
    needSource = 'manualForecast';
    manualTomorrowForecast = norm(manualRaw);
    closedTomorrow = manualTomorrowForecast === 0;
    bibleUsed = selectBibleId(eonInputs.date, config, eonInputs.bibleOverride);
    bibleName = config.bibleDisplayNames[bibleUsed];
    if (closedTomorrow) {
      need = { indi: 0, small: 0, large: 0, sic: 0 };
    } else {
      tomorrowRowMatched = lookupBibleRow(
        getBible(bibles, bibleUsed),
        manualTomorrowForecast!,
        config,
      );
      need = rowToNeeds(tomorrowRowMatched);
    }
  }

  // The check — all five sizes; Boli against 36 balls (0 when closed tomorrow).
  const checkAvailable = need !== null;
  const boliNeed: Maybe = checkAvailable ? (closedTomorrow ? 0 : config.boliTargetTrays * bpt.boli) : null;

  let eonLeft: PerBibleSizeMaybe | null = null;
  let traysShort: PerBibleSizeMaybe | null = null;
  let sicBallsShort: Maybe = null;
  let boliLeft: Maybe = null;
  let boliTraysShort: Maybe = null;
  if (need) {
    const leftFor = (haveVal: Maybe, needVal: Maybe): Maybe =>
      haveVal === null || needVal === null ? null : haveVal - needVal;
    eonLeft = {
      indi: leftFor(eonHave.indi, need.indi),
      small: leftFor(eonHave.small, need.small),
      large: leftFor(eonHave.large, need.large),
      sic: leftFor(eonHave.sic, need.sic),
    };
    const shortFor = (leftVal: Maybe, perTray: number): Maybe =>
      leftVal === null ? null : leftVal < 0 ? traysShortFor(-leftVal, perTray) : 0;
    traysShort = {
      indi: shortFor(eonLeft.indi, bpt.indi),
      small: shortFor(eonLeft.small, bpt.small),
      large: shortFor(eonLeft.large, bpt.large),
      sic: shortFor(eonLeft.sic, config.sicMakeTraySize),
    };
    sicBallsShort = eonLeft.sic === null ? null : eonLeft.sic < 0 ? -eonLeft.sic : 0;
    boliLeft = eonHave.boli === null || boliNeed === null ? null : eonHave.boli - boliNeed;
    boliTraysShort = shortFor(boliLeft, bpt.boli);
  }

  return {
    date: eonInputs.date,
    counts: eonInputs.counts,
    countedSizes,
    eonHave,
    finalSalesRaw: eonInputs.finalSalesRaw,
    finalSales,
    pmSales,
    pmUse,
    needSource,
    manualTomorrowForecastRaw: manualRaw,
    manualTomorrowForecast,
    bibleUsed,
    bibleName,
    tomorrowRowMatched,
    need,
    boliNeed,
    eonLeft,
    boliLeft,
    traysShort,
    boliTraysShort,
    sicBallsShort,
    flags: {
      tomorrowCheckAvailable: checkAvailable,
      closedTomorrow,
    },
  };
}

/**
 * Dough that went out before 2 PM: what last night closed with, less what
 * this afternoon counted. Blank for any size either side did not record, and
 * blank altogether on a day whose yesterday has no EON record (a closed day)
 * — a count that rose overnight means a miscount, not negative use.
 */
export function computeAmUse(
  yesterdayEonHave: PerSizeMaybe | null,
  todayHave: PerSizeMaybe,
  amSales: Maybe,
): AmUse {
  const blank: PerSizeMaybe = { indi: null, small: null, large: null, sic: null, boli: null };
  if (!yesterdayEonHave) return { sales: amSales, use: blank };
  return {
    sales: amSales,
    use: {
      indi: usedSince(yesterdayEonHave.indi, todayHave.indi),
      small: usedSince(yesterdayEonHave.small, todayHave.small),
      large: usedSince(yesterdayEonHave.large, todayHave.large),
      sic: usedSince(yesterdayEonHave.sic, todayHave.sic),
      boli: usedSince(yesterdayEonHave.boli, todayHave.boli),
    },
  };
}

/** Dough consumed between two counts. Null when unknown or when it went UP. */
function usedSince(before: Maybe, after: Maybe): Maybe {
  if (before === null || after === null) return null;
  const used = before - after;
  return used < 0 ? null : used;
}
