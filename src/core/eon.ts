import type { AppConfig } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeCountedSizes, computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  Bibles,
  DoughDayRecord,
  EonInputs,
  EonRecord,
  Maybe,
  PerBibleSizeMaybe,
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
