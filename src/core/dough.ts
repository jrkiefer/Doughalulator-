import type { AppConfig } from '../config';
import { getBible, lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { computeCountedSizes, computeHave } from './counting';
import { normalizeSales } from './sales';
import type {
  BatchOption,
  BibleSizeKey,
  Bibles,
  CountedInventory,
  CountedSizes,
  DoughDayRecord,
  DoughInputs,
  FinalDough,
  Maybe,
  PerBibleSizeMaybe,
  PerSizeMaybe,
} from './types';

const BIBLE_SIZES: BibleSizeKey[] = ['indi', 'small', 'large', 'sic'];

/** Split a tray delta between Small and Large (40/60 by default). If only one
 * of them was counted, it absorbs the whole delta; if neither, nothing moves. */
export function splitTrayDelta(
  delta: number,
  config: AppConfig,
  smallCounted = true,
  largeCounted = true,
): { smallTrayDelta: number; largeTrayDelta: number } {
  if (smallCounted && largeCounted) {
    const smallTrayDelta = Math.round(config.batchAdjustSplit.small * delta);
    return { smallTrayDelta, largeTrayDelta: delta - smallTrayDelta };
  }
  if (smallCounted) return { smallTrayDelta: delta, largeTrayDelta: 0 };
  if (largeCounted) return { smallTrayDelta: 0, largeTrayDelta: delta };
  return { smallTrayDelta: 0, largeTrayDelta: 0 };
}

interface BatchOptionParts {
  totalTrays: number;
  trays: PerBibleSizeMaybe;
  sicBalls: Maybe;
  boliTrays: Maybe;
  counts: CountedInventory;
  countedSizes: CountedSizes;
  have: PerSizeMaybe;
}

function addMaybe(a: Maybe, b: Maybe): Maybe {
  return a === null || b === null ? null : a + b;
}

/** Build one batch choice: adjust Small/Large trays to hit batches × traysPerBatch. */
export function buildBatchOption(
  batches: number,
  parts: BatchOptionParts,
  config: AppConfig,
): BatchOption {
  const { totalTrays, trays, sicBalls, boliTrays, counts, countedSizes, have } = parts;
  const bpt = config.ballsPerTray;
  const targetTrays = batches * config.traysPerBatch;
  const trayDelta = targetTrays - totalTrays;
  const { smallTrayDelta, largeTrayDelta } = splitTrayDelta(
    trayDelta,
    config,
    countedSizes.small && trays.small !== null,
    countedSizes.large && trays.large !== null,
  );

  // The floor at zero wins over hitting the batch target exactly: a big
  // round-down can ask Small or Large to give up more trays than it has, and a
  // negative tray count is nonsense on a bench. So when it bites, the per-size
  // trays add up to MORE than batches × traysPerBatch. That is the intended
  // trade — the mixer runs whole batches either way — not a rounding slip.
  const finalTraysToMake: PerSizeMaybe = {
    indi: trays.indi,
    small: trays.small === null ? null : Math.max(0, trays.small + smallTrayDelta),
    large: trays.large === null ? null : Math.max(0, trays.large + largeTrayDelta),
    sic: trays.sic,
    boli: boliTrays,
  };

  const ballsMade: PerSizeMaybe = {
    indi: finalTraysToMake.indi === null ? null : finalTraysToMake.indi * bpt.indi,
    small: finalTraysToMake.small === null ? null : finalTraysToMake.small * bpt.small,
    large: finalTraysToMake.large === null ? null : finalTraysToMake.large * bpt.large,
    sic: sicBalls,
    boli: finalTraysToMake.boli === null ? null : finalTraysToMake.boli * bpt.boli,
  };

  const finalDough: FinalDough = {
    indiTrays: addMaybe(counts.indiTrays ?? (countedSizes.indi ? 0 : null), finalTraysToMake.indi),
    indiSingles: countedSizes.indi ? (counts.indiSingles ?? 0) : null,
    indiTotal: addMaybe(have.indi, ballsMade.indi),
    smallTrays: addMaybe(counts.smallTrays ?? (countedSizes.small ? 0 : null), finalTraysToMake.small),
    smallSingles: countedSizes.small ? (counts.smallSingles ?? 0) : null,
    smallTotal: addMaybe(have.small, ballsMade.small),
    largeTrays: addMaybe(counts.largeTrays ?? (countedSizes.large ? 0 : null), finalTraysToMake.large),
    largeSingles: countedSizes.large ? (counts.largeSingles ?? 0) : null,
    largeTotal: addMaybe(have.large, ballsMade.large),
    sicTotal: addMaybe(have.sic, ballsMade.sic),
    boliTrays: addMaybe(counts.boliTrays ?? (countedSizes.boli ? 0 : null), finalTraysToMake.boli),
    boliSingles: countedSizes.boli ? (counts.boliSingles ?? 0) : null,
    boliTotal: addMaybe(have.boli, ballsMade.boli),
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

/**
 * The whole 2 PM calculation. Pure: everything comes in, everything lands on
 * the record. Blank inputs are null and stay null ("—"), a typed 0 is a real
 * zero, and a tomorrow forecast of exactly 0 means the shop is closed
 * tomorrow (zero need for every size, including Boli).
 */
export function runDoughCalculation(
  inputs: DoughInputs,
  bibles: Bibles,
  config: AppConfig,
): DoughDayRecord {
  const bpt = config.ballsPerTray;
  const norm = (raw: Maybe): Maybe =>
    raw === null ? null : normalizeSales(raw, config.salesShorthand);

  const todayForecast = norm(inputs.todayForecastRaw);
  const currentSales = norm(inputs.currentSalesRaw);
  const tomorrowForecast = norm(inputs.tomorrowForecastRaw);

  const bibleUsed = selectBibleId(inputs.date, config, inputs.bibleOverride);
  const bible = getBible(bibles, bibleUsed);

  const countedSizes = computeCountedSizes(inputs.counts);
  const have = computeHave(inputs.counts, config);

  // Tonight: how much of what we have gets used before close.
  const tonightKnown = todayForecast !== null && currentSales !== null;
  const salesLeft = tonightKnown ? todayForecast! - currentSales! : null;
  const negativeSalesLeft = salesLeft !== null && salesLeft < 0;
  const tonightRowMatched =
    salesLeft !== null && salesLeft > 0 ? lookupBibleRow(bible, salesLeft, config) : null;
  const tonightUse = tonightRowMatched
    ? rowToNeeds(tonightRowMatched)
    : tonightKnown
      ? { indi: 0, small: 0, large: 0, sic: 0 }
      : null;

  const use: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  const left: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  const setOutTrays: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  const setOutBalls: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  const perTray: Record<BibleSizeKey, number> = {
    indi: bpt.indi,
    small: bpt.small,
    large: bpt.large,
    sic: config.sicMakeTraySize,
  };
  for (const size of BIBLE_SIZES) {
    if (!tonightUse || !countedSizes[size]) continue;
    use[size] = tonightUse[size];
    const raw = have[size]! - tonightUse[size];
    if (size === 'sic') {
      // Sicilian is never set out and used the same day (owner's rule, Aug 2026):
      // it simply runs out. So its "left" floors at zero rather than carrying a
      // negative, there is nothing to set out, and tomorrow's make is the plain
      // need — not the need plus a shortfall that was never covered.
      left[size] = Math.max(0, raw);
      setOutBalls[size] = 0;
      setOutTrays[size] = 0;
      continue;
    }
    left[size] = raw;
    const shortfall = raw < 0 ? -raw : 0;
    setOutBalls[size] = shortfall;
    setOutTrays[size] = shortfall > 0 ? Math.ceil(shortfall / perTray[size]) : 0;
  }
  const shortageSizes = BIBLE_SIZES.filter((size) => (left[size] ?? 0) < 0);

  // Tomorrow: the bible's need — or zero everywhere when the shop is closed.
  const closedTomorrow = tomorrowForecast === 0;
  const tomorrowRowMatched =
    tomorrowForecast !== null && !closedTomorrow
      ? lookupBibleRow(bible, tomorrowForecast, config)
      : null;
  const tomorrowNeed = closedTomorrow
    ? { indi: 0, small: 0, large: 0, sic: 0 }
    : tomorrowRowMatched
      ? rowToNeeds(tomorrowRowMatched)
      : null;

  const need: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  const make: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  const trays: PerBibleSizeMaybe = { indi: null, small: null, large: null, sic: null };
  for (const size of BIBLE_SIZES) {
    if (!tomorrowNeed) continue;
    need[size] = tomorrowNeed[size];
    if (closedTomorrow) {
      // Closed tomorrow: nothing gets made, whatever the counts say.
      make[size] = 0;
      trays[size] = 0;
    } else if (left[size] !== null) {
      // Set-out replacement: left may be negative, so tomorrow's make
      // includes tonight's set-out dough. Floor at zero only after that.
      make[size] = Math.max(0, tomorrowNeed[size] - left[size]!);
      trays[size] = Math.ceil(make[size]! / perTray[size]);
    }
  }
  const sicBalls = make.sic;

  // Boli skips the bible: top up to the target, counting trays AND singles.
  const boliTargetBalls = config.boliTargetTrays * bpt.boli;
  const boliTrays = closedTomorrow
    ? 0
    : countedSizes.boli
      ? Math.ceil(Math.max(0, boliTargetBalls - have.boli!) / bpt.boli)
      : null;

  // Batches need tonight AND tomorrow to be known; uncounted sizes are excluded.
  // With NOTHING counted there is no answer to give: every size would contribute
  // zero and the total would read as a confident "nothing to make" when the real
  // state is "we haven't counted yet". Closed tomorrow is the exception — then
  // zero is the true answer whatever the counts say.
  const anySizeCounted = BIBLE_SIZES.some((size) => countedSizes[size]) || countedSizes.boli;
  const batchesKnown = tonightKnown && tomorrowNeed !== null && (closedTomorrow || anySizeCounted);
  let totalTrays: Maybe = null;
  if (batchesKnown) {
    totalTrays = closedTomorrow
      ? 0
      : BIBLE_SIZES.reduce((sum, size) => sum + (trays[size] ?? 0), 0) + (boliTrays ?? 0);
  }
  const exactBatches = totalTrays === null ? null : totalTrays / config.traysPerBatch;

  let batchDown: BatchOption | null = null;
  let batchUp: BatchOption | null = null;
  if (totalTrays !== null && totalTrays > 0) {
    const parts: BatchOptionParts = {
      totalTrays,
      trays,
      sicBalls,
      boliTrays,
      counts: inputs.counts,
      countedSizes,
      have,
    };
    // Round-down is floored at one batch: a night with dough to make never
    // gets offered a zero-batch option.
    batchDown = buildBatchOption(Math.max(1, Math.floor(exactBatches!)), parts, config);
    batchUp = buildBatchOption(Math.ceil(exactBatches!), parts, config);
  }

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
    countedSizes,
    have,
    use,
    left,
    setOutTrays,
    setOutBalls,
    need,
    make,
    trays,
    sicBalls,
    boliTrays,
    totalTrays,
    exactBatches,
    batchDown,
    batchUp,
    chosenBatchOption: null,
    flags: {
      closedTomorrow,
      negativeSalesLeft,
      boliNotCounted: !countedSizes.boli,
      shortageSizes,
    },
  };
}
