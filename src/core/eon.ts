import type { AppConfig, RoundDirection } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeCountedSizes, computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  Bibles,
  EonOutlook,
  DoughDayRecord,
  EonInputs,
  EonRecord,
  Maybe,
  PerBibleSizeMaybe,
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
  // The night's dough use (AM, PM, All Day) is NOT worked out here: the Dough
  // Log derives it from the recorded counts after every close (deriveUse in
  // apps-script/dough/Code.gs), which is the one definition of it.

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
      // The night's own rounding, which the 2 PM forecasts decided — never the
      // figure typed here. Without a 2 PM record there is no slow-day gate to
      // read, so it rounds up like any ordinary night.
      const round: RoundDirection = dayRecord?.rounding.forecast ?? 'up';
      tomorrowRowMatched = lookupBibleRow(
        getBible(bibles, bibleUsed),
        manualTomorrowForecast!,
        config,
        round,
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

  let outlook: EonOutlook | null = null;
  if (need) {
    const leftFor = (haveVal: Maybe, needVal: Maybe): Maybe =>
      haveVal === null || needVal === null ? null : haveVal - needVal;

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
    needSource,
    manualTomorrowForecastRaw: manualRaw,
    manualTomorrowForecast,
    bibleUsed,
    bibleName,
    tomorrowRowMatched,
    need,
    boliNeed,
    outlook,
    flags: {
      tomorrowCheckAvailable: checkAvailable,
      closedTomorrow,
    },
  };
}
