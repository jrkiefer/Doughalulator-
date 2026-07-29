import type { AppConfig } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  BatchOption,
  BibleSizeKey,
  Bibles,
  CountedInventory,
  DoughDayRecord,
  DoughInputs,
  FinalDough,
  PerBibleSize,
  PerSize,
} from './types';

const BIBLE_SIZES: BibleSizeKey[] = ['indi', 'small', 'large', 'sic'];

const ZERO_USE: PerBibleSize = { indi: 0, small: 0, large: 0, sic: 0 };

/** Split a tray delta between Small and Large (40/60 by default). */
export function splitTrayDelta(
  delta: number,
  config: AppConfig,
): { smallTrayDelta: number; largeTrayDelta: number } {
  const smallTrayDelta = Math.round(config.batchAdjustSplit.small * delta);
  return { smallTrayDelta, largeTrayDelta: delta - smallTrayDelta };
}

interface BatchOptionParts {
  totalTrays: number;
  trays: PerBibleSize;
  sicBalls: number;
  boilTrays: number;
  counts: CountedInventory;
  have: PerSize;
}

/** Build one batch choice: adjust Small/Large trays to hit batches × traysPerBatch. */
export function buildBatchOption(
  batches: number,
  parts: BatchOptionParts,
  config: AppConfig,
): BatchOption {
  const { totalTrays, trays, sicBalls, boilTrays, counts, have } = parts;
  const bpt = config.ballsPerTray;
  const targetTrays = batches * config.traysPerBatch;
  const trayDelta = targetTrays - totalTrays;
  const { smallTrayDelta, largeTrayDelta } = splitTrayDelta(trayDelta, config);

  const finalTraysToMake: PerSize = {
    indi: trays.indi,
    small: Math.max(0, trays.small + smallTrayDelta),
    large: Math.max(0, trays.large + largeTrayDelta),
    sic: trays.sic,
    boil: boilTrays,
  };

  const ballsMade: PerSize = {
    indi: finalTraysToMake.indi * bpt.indi,
    small: finalTraysToMake.small * bpt.small,
    large: finalTraysToMake.large * bpt.large,
    sic: sicBalls,
    boil: finalTraysToMake.boil * bpt.boil,
  };

  const finalDough: FinalDough = {
    indiTrays: counts.indiTrays + finalTraysToMake.indi,
    indiSingles: counts.indiSingles,
    indiTotal: have.indi + ballsMade.indi,
    smallTrays: counts.smallTrays + finalTraysToMake.small,
    smallSingles: counts.smallSingles,
    smallTotal: have.small + ballsMade.small,
    largeTrays: counts.largeTrays + finalTraysToMake.large,
    largeSingles: counts.largeSingles,
    largeTotal: have.large + ballsMade.large,
    sicTotal: have.sic + ballsMade.sic,
    boilTrays: counts.boilTrays + finalTraysToMake.boil,
    boilSingles: counts.boilSingles,
    boilTotal: have.boil + ballsMade.boil,
  };

  return {
    batches,
    targetTrays,
    trayDelta,
    smallTrayDelta,
    largeTrayDelta,
    finalTraysToMake,
    ballsMade,
    finalDough,
  };
}

/** The whole 2 PM calculation. Pure: everything comes in, everything lands on the record. */
export function runDoughCalculation(
  inputs: DoughInputs,
  bibles: Bibles,
  config: AppConfig,
): DoughDayRecord {
  const bpt = config.ballsPerTray;

  const todayForecast = normalizeSales(inputs.todayForecastRaw, config.salesShorthand);
  const currentSales = normalizeSales(inputs.currentSalesRaw, config.salesShorthand);
  const tomorrowForecast = normalizeSales(inputs.tomorrowForecastRaw, config.salesShorthand);

  const bibleUsed = selectBibleId(inputs.date, config, inputs.bibleOverride);
  const bible = getBible(bibles, bibleUsed);

  const have = computeHave(inputs.counts, config);

  // Tonight: how much of what we have gets used before close.
  const salesLeft = todayForecast - currentSales;
  const negativeSalesLeft = salesLeft < 0;
  const tonightRowMatched = salesLeft > 0 ? lookupBibleRow(bible, salesLeft, config) : null;
  const use = tonightRowMatched ? rowToNeeds(tonightRowMatched) : { ...ZERO_USE };

  const leftRaw: PerBibleSize = {
    indi: have.indi - use.indi,
    small: have.small - use.small,
    large: have.large - use.large,
    sic: have.sic - use.sic,
  };
  const left: PerBibleSize = {
    indi: Math.max(0, leftRaw.indi),
    small: Math.max(0, leftRaw.small),
    large: Math.max(0, leftRaw.large),
    sic: Math.max(0, leftRaw.sic),
  };
  const shortageSizes = BIBLE_SIZES.filter((size) => leftRaw[size] < 0);

  // Tomorrow: what the bible says we need, minus what will be left tonight.
  const tomorrowRowMatched = lookupBibleRow(bible, tomorrowForecast, config);
  const need = rowToNeeds(tomorrowRowMatched);
  const make: PerBibleSize = {
    indi: Math.max(0, need.indi - left.indi),
    small: Math.max(0, need.small - left.small),
    large: Math.max(0, need.large - left.large),
    sic: Math.max(0, need.sic - left.sic),
  };

  const trays: PerBibleSize = {
    indi: Math.ceil(make.indi / bpt.indi),
    small: Math.ceil(make.small / bpt.small),
    large: Math.ceil(make.large / bpt.large),
    sic: Math.ceil(make.sic / config.sicMakeTraySize),
  };
  const sicBalls = make.sic;

  // Boil skips the bible entirely: top the count back up to the target.
  const boilTrays = Math.max(0, config.boilTargetTrays - inputs.counts.boilTrays);

  const totalTrays = trays.indi + trays.small + trays.large + trays.sic + boilTrays;
  const exactBatches = totalTrays / config.traysPerBatch;

  const parts: BatchOptionParts = {
    totalTrays,
    trays,
    sicBalls,
    boilTrays,
    counts: inputs.counts,
    have,
  };
  const batchDown = buildBatchOption(Math.floor(exactBatches), parts, config);
  const batchUp = buildBatchOption(Math.ceil(exactBatches), parts, config);

  return {
    date: inputs.date,
    todayForecastRaw: inputs.todayForecastRaw,
    todayForecast,
    currentSalesRaw: inputs.currentSalesRaw,
    currentSales,
    tomorrowForecastRaw: inputs.tomorrowForecastRaw,
    tomorrowForecast,
    salesLeft,
    bibleUsed,
    bibleName: config.bibleDisplayNames[bibleUsed],
    tonightRowMatched,
    tomorrowRowMatched,
    counts: inputs.counts,
    have,
    use,
    leftRaw,
    left,
    need,
    make,
    trays,
    sicBalls,
    boilTrays,
    totalTrays,
    exactBatches,
    batchDown,
    batchUp,
    chosenBatchOption: null,
    flags: { negativeSalesLeft, shortageSizes },
  };
}
