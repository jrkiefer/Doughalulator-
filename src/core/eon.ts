import type { AppConfig } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeCountedSizes, computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  AmUse,
  Bibles,
  EonOutlook,
  DoughDayRecord,
  EonInputs,
  EonRecord,
  Maybe,
  PerBibleSizeMaybe,
  PerSizeMaybe,
  SizeKey,
} from './types';

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

  // Where tomorrow's need comes from. A figure typed here WINS over the 2 PM
  // one: the box on the EON page shows the afternoon's forecast, and the whole
  // point of being able to type in it is to say "actually, tomorrow looks
  // different from what we thought". Clear it and the 2 PM figure comes back.
  let needSource: EonRecord['needSource'] = null;
  let need: PerBibleSizeMaybe | null = null;
  let closedTomorrow = false;
  const manualRaw = eonInputs.manualTomorrowForecastRaw ?? null;
  let manualTomorrowForecast: Maybe = null;
  let bibleUsed: EonRecord['bibleUsed'] = null;
  let bibleName: string | null = null;
  let tomorrowRowMatched: EonRecord['tomorrowRowMatched'] = null;

  if (manualRaw !== null) {
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
  } else if (dayRecord && dayRecord.tomorrowForecast !== null) {
    needSource = 'dayRecord';
    need = dayRecord.need;
    closedTomorrow = dayRecord.flags.closedTomorrow;
  }

  // The check — all five sizes; Boli against 36 balls (0 when closed tomorrow).
  const checkAvailable = need !== null;
  const boliNeed: Maybe = checkAvailable ? (closedTomorrow ? 0 : config.boliTargetTrays * bpt.boli) : null;

  let eonLeft: PerBibleSizeMaybe | null = null;
  let boliLeft: Maybe = null;
  let outlook: EonOutlook | null = null;
  if (need) {
    const leftFor = (haveVal: Maybe, needVal: Maybe): Maybe =>
      haveVal === null || needVal === null ? null : haveVal - needVal;
    eonLeft = {
      indi: leftFor(eonHave.indi, need.indi),
      small: leftFor(eonHave.small, need.small),
      large: leftFor(eonHave.large, need.large),
      sic: leftFor(eonHave.sic, need.sic),
    };
    boliLeft = leftFor(eonHave.boli, boliNeed);

    // What the outlook card draws: the gap per size, in balls and in trays.
    const rows = {} as EonOutlook['rows'];
    let surplusBalls = 0;
    let surplusTrays = 0;
    let shortfallBalls = 0;
    let shortTrays = 0;
    let anyCounted = false;
    const add = (key: SizeKey, haveVal: Maybe, needVal: Maybe, perTray: number) => {
      if (haveVal !== null) anyCounted = true;
      let diff = leftFor(haveVal, needVal);
      // Sicilian bottoms out at 0: it is never set out and used the same day,
      // so being "short" of tomorrow cannot mean dipping into tonight's dough.
      if (key === 'sic' && diff !== null) diff = Math.max(0, diff);
      // `|| 0` normalises the -0 that Math.sign gives on a sub-tray shortage.
      const trays: Maybe =
        diff === null ? null : Math.sign(diff) * Math.round(Math.abs(diff) / perTray) || 0;
      if (diff !== null) {
        if (diff >= 0) {
          surplusBalls += diff;
          surplusTrays += trays!;
        } else {
          shortfallBalls += -diff;
          shortTrays += -trays!;
        }
      }
      rows[key] = { have: haveVal, need: needVal, diff, trays };
    };
    add('indi', eonHave.indi, need.indi, bpt.indi);
    add('small', eonHave.small, need.small, bpt.small);
    add('large', eonHave.large, need.large, bpt.large);
    add('sic', eonHave.sic, need.sic, config.sicMakeTraySize);
    add('boli', eonHave.boli, boliNeed, bpt.boli);
    outlook = { rows, surplusBalls, surplusTrays, shortfallBalls, shortTrays, anyCounted };
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
    outlook,
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
