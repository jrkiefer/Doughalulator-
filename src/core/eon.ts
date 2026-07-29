import type { AppConfig } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  Bibles,
  DoughDayRecord,
  EonInputs,
  EonRecord,
  PerBibleSize,
  PerSize,
  SizeKey,
} from './types';

const ALL_SIZES: SizeKey[] = ['indi', 'small', 'large', 'sic', 'boil'];

/** Trays short, rounded up, for one size's shortfall (a non-negative number of balls). */
function traysShortFor(shortBalls: number, perTray: number): number {
  return Math.ceil(shortBalls / perTray);
}

/**
 * The end-of-night calculation. Works with or without the day's 2 PM record:
 * without one it still counts dough and takes final sales, and a
 * manually-entered tomorrow forecast can stand in for the day record's need.
 */
export function runEonCalculation(
  eonInputs: EonInputs,
  dayRecord: DoughDayRecord | null,
  bibles: Bibles,
  config: AppConfig,
): EonRecord {
  const bpt = config.ballsPerTray;

  const eonHave = computeHave(eonInputs.counts, config);
  const finalSales = normalizeSales(eonInputs.finalSalesRaw, config.salesShorthand);

  const pmSales = dayRecord ? finalSales - dayRecord.currentSales : null;

  // Where tomorrow's need comes from: the day record, or a manual forecast lookup.
  let needSource: EonRecord['needSource'] = null;
  let need: PerBibleSize | null = null;
  let manualTomorrowForecast: number | null = null;
  let bibleUsed: EonRecord['bibleUsed'] = null;
  let bibleName: string | null = null;
  let tomorrowRowMatched: EonRecord['tomorrowRowMatched'] = null;
  if (dayRecord) {
    needSource = 'dayRecord';
    need = dayRecord.need;
  } else if (eonInputs.manualTomorrowForecastRaw !== undefined) {
    needSource = 'manualForecast';
    manualTomorrowForecast = normalizeSales(
      eonInputs.manualTomorrowForecastRaw,
      config.salesShorthand,
    );
    bibleUsed = selectBibleId(eonInputs.date, config, eonInputs.bibleOverride);
    bibleName = config.bibleDisplayNames[bibleUsed];
    tomorrowRowMatched = lookupBibleRow(
      getBible(bibles, bibleUsed),
      manualTomorrowForecast,
      config,
    );
    need = rowToNeeds(tomorrowRowMatched);
  }

  // Tomorrow check — Indi/Small/Large/Sic only, never Boil.
  let eonLeft: PerBibleSize | null = null;
  let traysShort: PerBibleSize | null = null;
  let sicBallsShort: number | null = null;
  if (need) {
    eonLeft = {
      indi: eonHave.indi - need.indi,
      small: eonHave.small - need.small,
      large: eonHave.large - need.large,
      sic: eonHave.sic - need.sic,
    };
    traysShort = {
      indi: eonLeft.indi < 0 ? traysShortFor(-eonLeft.indi, bpt.indi) : 0,
      small: eonLeft.small < 0 ? traysShortFor(-eonLeft.small, bpt.small) : 0,
      large: eonLeft.large < 0 ? traysShortFor(-eonLeft.large, bpt.large) : 0,
      sic: eonLeft.sic < 0 ? traysShortFor(-eonLeft.sic, config.sicMakeTraySize) : 0,
    };
    sicBallsShort = eonLeft.sic < 0 ? -eonLeft.sic : 0;
  }

  // PM use, all five sizes: what tonight's count says actually got used since 2 PM.
  // Needs the day record AND the batch option the owner tapped.
  let pmUse: PerSize | null = null;
  if (dayRecord && dayRecord.chosenBatchOption) {
    const chosen =
      dayRecord.chosenBatchOption === 'down' ? dayRecord.batchDown : dayRecord.batchUp;
    const fd = chosen.finalDough;
    pmUse = {
      indi: fd.indiTotal - eonHave.indi,
      small: fd.smallTotal - eonHave.small,
      large: fd.largeTotal - eonHave.large,
      sic: fd.sicTotal - eonHave.sic,
      boil: fd.boilTotal - eonHave.boil,
    };
  }

  return {
    date: eonInputs.date,
    counts: eonInputs.counts,
    eonHave,
    finalSalesRaw: eonInputs.finalSalesRaw,
    finalSales,
    pmSales,
    needSource,
    manualTomorrowForecastRaw: eonInputs.manualTomorrowForecastRaw ?? null,
    manualTomorrowForecast,
    bibleUsed,
    bibleName,
    tomorrowRowMatched,
    need,
    eonLeft,
    traysShort,
    sicBallsShort,
    pmUse,
    flags: {
      pmSalesAvailable: pmSales !== null,
      tomorrowCheckAvailable: need !== null,
      pmUseAvailable: pmUse !== null,
      negativePmUseSizes: pmUse
        ? ALL_SIZES.filter((size) => pmUse![size] < 0)
        : [],
    },
  };
}
