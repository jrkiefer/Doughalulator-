import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { buildBatchOption, runDoughCalculation, splitTrayDelta } from './dough';
import { bibles, counts } from './testHelpers';
import type { DoughInputs } from './types';

function run(partial: Partial<DoughInputs>) {
  return runDoughCalculation(
    {
      date: '2026-01-15',
      counts: counts(),
      todayForecastRaw: null,
      currentSalesRaw: null,
      tomorrowForecastRaw: null,
      ...partial,
    },
    bibles,
    defaultConfig,
  );
}

const FULL_COUNTS = counts({
  indiTrays: 1, indiSingles: 4,
  smallTrays: 5, smallSingles: 3,
  largeTrays: 4, largeSingles: 2,
  sicSingles: 1,
  boliTrays: 2, boliSingles: 1,
});

describe('tonight lookup special cases', () => {
  it('salesLeft exactly 0 → use 0 for every counted size, no bible row, no flag', () => {
    const record = run({
      counts: counts({ smallTrays: 5, largeTrays: 4 }),
      todayForecastRaw: 5.2,
      currentSalesRaw: 5.2,
    });
    expect(record.salesLeft).toBe(0);
    expect(record.use.small).toBe(0);
    expect(record.use.large).toBe(0);
    expect(record.use.indi).toBeNull(); // not counted → contributes nothing
    expect(record.tonightRowMatched).toBeNull();
    expect(record.flags.negativeSalesLeft).toBe(false);
  });

  it('negative salesLeft → use 0 AND the negativeSalesLeft flag', () => {
    const record = run({
      counts: counts({ smallTrays: 1 }),
      todayForecastRaw: 5.2,
      currentSalesRaw: 5.5,
    });
    expect(record.salesLeft).toBe(-300);
    expect(record.use.small).toBe(0);
    expect(record.flags.negativeSalesLeft).toBe(true);
  });

  it('blank today or current sales → tonight is simply unknown (nulls, no flags)', () => {
    const record = run({ counts: FULL_COUNTS, todayForecastRaw: 5.2 });
    expect(record.salesLeft).toBeNull();
    expect(record.use).toEqual({ indi: null, small: null, large: null, sic: null });
    expect(record.left).toEqual({ indi: null, small: null, large: null, sic: null });
  });
});

describe('set-out and replacement (§1b)', () => {
  // Have small 8, use 58 (row 4000) → left −50: set out 7 trays tonight,
  // and tomorrow's make replaces those 50 balls on top of the need.
  const record = run({
    counts: counts({ indiTrays: 2, smallTrays: 1, largeTrays: 10, sicSingles: 3 }),
    todayForecastRaw: 4.0,
    currentSalesRaw: 0,
    tomorrowForecastRaw: 4.0,
  });

  it('left keeps the raw negative', () => {
    expect(record.left).toEqual({ indi: 10, small: -50, large: 10, sic: 1 });
    expect(record.flags.shortageSizes).toEqual(['small']);
  });

  it('tells the owner what to set out tonight, in whole trays', () => {
    expect(record.setOutBalls).toEqual({ indi: 0, small: 50, large: 0, sic: 0 });
    expect(record.setOutTrays).toEqual({ indi: 0, small: Math.ceil(50 / 8), large: 0, sic: 0 });
  });

  it('make = need − left, so the set-out dough is replaced (dough conserves)', () => {
    // need (row 4000): 12/58/50/2 → small make = 58 − (−50) = 108.
    expect(record.make.small).toBe(108);
    // Conservation: make − need = the set-out shortfall.
    expect(record.make.small! - record.need.small!).toBe(50);
    // No shortfall → plain need − left.
    expect(record.make.indi).toBe(2); // 12 − 10
    expect(record.make.large).toBe(40); // 50 − 10
  });
});

describe('Sicilian never goes negative same-day (owner\'s rule, Aug 2026)', () => {
  // Sicilian is never set out and used the same day — it just runs out. So a
  // shortfall tonight leaves 0, not a negative, and tomorrow makes the plain
  // need rather than the need plus dough that was never actually set out.
  const short = run({
    counts: counts({ sicSingles: 1, smallTrays: 20, largeTrays: 20 }),
    todayForecastRaw: 4.0,
    currentSalesRaw: 0,
    tomorrowForecastRaw: 4.0,
  });

  it('left floors at 0 instead of going negative', () => {
    // Row 4000 asks for 2 Sic tonight against 1 on hand.
    expect(short.use.sic).toBe(2);
    expect(short.left.sic).toBe(0);
  });

  it('nothing is set out and it is not called a shortage', () => {
    expect(short.setOutBalls.sic).toBe(0);
    expect(short.setOutTrays.sic).toBe(0);
    expect(short.flags.shortageSizes).not.toContain('sic');
  });

  it("tomorrow makes the plain need — the shortfall is not added back", () => {
    expect(short.make.sic).toBe(short.need.sic);
    expect(short.trays.sic).toBe(Math.ceil(short.need.sic! / defaultConfig.sicMakeTraySize));
  });

  it('the other sizes still set out and still replace their shortfall', () => {
    const rec = run({
      counts: counts({ smallTrays: 1, sicSingles: 9 }),
      todayForecastRaw: 4.0,
      currentSalesRaw: 0,
      tomorrowForecastRaw: 4.0,
    });
    expect(rec.left.small).toBeLessThan(0);
    expect(rec.setOutTrays.small).toBeGreaterThan(0);
    expect(rec.make.small).toBe(rec.need.small! - rec.left.small!);
  });

  it('a Sicilian surplus is untouched — the floor only catches negatives', () => {
    const spare = run({
      counts: counts({ sicSingles: 40 }),
      todayForecastRaw: 4.0,
      currentSalesRaw: 0,
      tomorrowForecastRaw: 4.0,
    });
    expect(spare.left.sic).toBe(40 - spare.use.sic!);
    expect(spare.make.sic).toBe(Math.max(0, spare.need.sic! - spare.left.sic!));
  });
});

describe('closed tomorrow (§1a)', () => {
  const record = run({
    counts: FULL_COUNTS,
    todayForecastRaw: 5.2,
    currentSalesRaw: 2.2,
    tomorrowForecastRaw: 0,
  });

  it('a typed 0 forecast zeroes need, make, and trays for every size including Boli', () => {
    expect(record.flags.closedTomorrow).toBe(true);
    expect(record.need).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.make).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.trays).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.boliTrays).toBe(0);
    expect(record.totalTrays).toBe(0);
    expect(record.tomorrowRowMatched).toBeNull();
  });

  it('offers no batch choice at all', () => {
    expect(record.batchDown).toBeNull();
    expect(record.batchUp).toBeNull();
  });

  it('a BLANK tomorrow forecast is not a zero — everything stays unknown', () => {
    const blank = run({
      counts: FULL_COUNTS,
      todayForecastRaw: 5.2,
      currentSalesRaw: 2.2,
    });
    expect(blank.flags.closedTomorrow).toBe(false);
    expect(blank.need).toEqual({ indi: null, small: null, large: null, sic: null });
    expect(blank.make.small).toBeNull();
    expect(blank.totalTrays).toBeNull();
    expect(blank.batchDown).toBeNull();
    expect(blank.batchUp).toBeNull();
  });
});

describe('Boli top-up (§1d)', () => {
  const base = { todayForecastRaw: 5.2, currentSalesRaw: 5.2, tomorrowForecastRaw: 3.75 };

  it('counts trays AND singles toward the 36-ball target', () => {
    // 2 trays + 1 single = 13 balls → 23 short → 4 trays (ceil 23/6).
    expect(run({ ...base, counts: counts({ boliTrays: 2, boliSingles: 1 }) }).boliTrays).toBe(4);
    // 5 trays + 6 singles = 36 balls → exactly at target → 0.
    expect(run({ ...base, counts: counts({ boliTrays: 5, boliSingles: 6 }) }).boliTrays).toBe(0);
    // Singles alone count too: 35 balls → 1 short → 1 tray.
    expect(run({ ...base, counts: counts({ boliTrays: 5, boliSingles: 5 }) }).boliTrays).toBe(1);
  });

  it('never negative when over target', () => {
    expect(run({ ...base, counts: counts({ boliTrays: 7 }) }).boliTrays).toBe(0);
  });

  it('blank Boli count → excluded (null) with the boliNotCounted flag, batches still compute', () => {
    const record = run({
      ...base,
      counts: counts({ indiTrays: 4, smallTrays: 30, largeTrays: 30, sicSingles: 8 }),
    });
    expect(record.boliTrays).toBeNull();
    expect(record.flags.boliNotCounted).toBe(true);
    expect(record.totalTrays).toBe(0); // everything else covered; boli contributes nothing
  });
});

describe('batch options (§1e)', () => {
  it('round-down is floored at 1 batch whenever there is dough to make', () => {
    // Tiny make: tomorrow 3.75 (need 11/52/44/2), nothing counted but sic typed 0
    // → sic make 2 → 1 tray; boli 0 counted → 6 trays. Total 7 → exact 0.64.
    const record = run({
      counts: counts({
        indiTrays: 1, smallTrays: 7, largeTrays: 8, sicSingles: 0, boliTrays: 0,
      }),
      todayForecastRaw: 5.2,
      currentSalesRaw: 5.2,
      tomorrowForecastRaw: 3.75,
    });
    expect(record.totalTrays).toBe(7);
    expect(record.batchDown!.batches).toBe(1);
    expect(record.batchUp!.batches).toBe(1);
  });

  it('when totalTrays is divisible by 11 both options are the same whole number', () => {
    const parts = {
      totalTrays: 22,
      trays: { indi: 2, small: 8, large: 6, sic: 2 },
      sicBalls: 5,
      boliTrays: 4,
      counts: counts({ smallTrays: 1, largeTrays: 1 }),
      countedSizes: { indi: true, small: true, large: true, sic: true, boli: true },
      have: { indi: 0, small: 8, large: 6, sic: 0, boli: 0 },
    };
    const down = buildBatchOption(2, parts, defaultConfig);
    expect(down.trayDelta).toBe(0);
    expect(down.finalTraysToMake).toEqual({ indi: 2, small: 8, large: 6, sic: 2, boli: 4 });
  });

  it('never adjusts Small or Large below 0 trays', () => {
    const parts = {
      totalTrays: 9,
      trays: { indi: 0, small: 2, large: 3, sic: 0 },
      sicBalls: 0,
      boliTrays: 4,
      counts: counts({ smallTrays: 1, largeTrays: 1, boliTrays: 2 }),
      countedSizes: { indi: true, small: true, large: true, sic: true, boli: true },
      have: { indi: 0, small: 8, large: 6, sic: 0, boli: 12 },
    };
    const option = buildBatchOption(0, parts, defaultConfig);
    expect(option.finalTraysToMake.small).toBe(0);
    expect(option.finalTraysToMake.large).toBe(0);
  });
});

describe('splitTrayDelta (lean-large: LG = ceil(0.6 × n), SM takes the rest)', () => {
  it('splits between both when both are counted', () => {
    expect(splitTrayDelta(10, defaultConfig)).toEqual({ smallTrayDelta: 4, largeTrayDelta: 6 });
    expect(splitTrayDelta(-10, defaultConfig)).toEqual({ smallTrayDelta: -4, largeTrayDelta: -6 });
    expect(splitTrayDelta(-7, defaultConfig)).toEqual({ smallTrayDelta: -2, largeTrayDelta: -5 });
  });

  it('Large is STRICTLY ahead at every delta — the point of leaning large', () => {
    for (let n = 1; n <= 12; n++) {
      const { smallTrayDelta, largeTrayDelta } = splitTrayDelta(n, defaultConfig);
      expect(smallTrayDelta + largeTrayDelta).toBe(n);
      expect(largeTrayDelta).toBeGreaterThan(smallTrayDelta);
    }
  });

  it('the deltas where leaning large differs from an even 40/60 split', () => {
    // These four are exactly where the old app and a rounded 0.4 share part ways.
    expect(splitTrayDelta(2, defaultConfig)).toEqual({ smallTrayDelta: 0, largeTrayDelta: 2 });
    expect(splitTrayDelta(4, defaultConfig)).toEqual({ smallTrayDelta: 1, largeTrayDelta: 3 });
    expect(splitTrayDelta(7, defaultConfig)).toEqual({ smallTrayDelta: 2, largeTrayDelta: 5 });
    expect(splitTrayDelta(9, defaultConfig)).toEqual({ smallTrayDelta: 3, largeTrayDelta: 6 });
  });

  it('a round-down mirrors the same lean (Large gives up the most)', () => {
    expect(splitTrayDelta(-4, defaultConfig)).toEqual({ smallTrayDelta: -1, largeTrayDelta: -3 });
    expect(splitTrayDelta(-2, defaultConfig)).toEqual({ smallTrayDelta: 0, largeTrayDelta: -2 });
  });

  it('gives the whole delta to the only counted one', () => {
    expect(splitTrayDelta(5, defaultConfig, true, false)).toEqual({ smallTrayDelta: 5, largeTrayDelta: 0 });
    expect(splitTrayDelta(5, defaultConfig, false, true)).toEqual({ smallTrayDelta: 0, largeTrayDelta: 5 });
    expect(splitTrayDelta(5, defaultConfig, false, false)).toEqual({ smallTrayDelta: 0, largeTrayDelta: 0 });
  });
});

describe('the tray floor at zero (a deliberate trade, pinned here)', () => {
  it('never asks for negative trays, even when that overshoots the batch target', () => {
    // Small has only 1 tray to give but the round-down wants several back.
    const option = buildBatchOption(
      1,
      {
        totalTrays: 30,
        trays: { indi: 20, small: 1, large: 9, sic: 0 },
        sicBalls: 0,
        boliTrays: 0,
        counts: counts({ indiTrays: 0, smallTrays: 0, largeTrays: 0, boliTrays: 0, sicSingles: 0 }),
        countedSizes: { indi: true, small: true, large: true, sic: true, boli: true },
        have: { indi: 0, small: 0, large: 0, sic: 0, boli: 0 },
      },
      defaultConfig,
    );
    expect(option.finalTraysToMake.small).toBe(0);
    expect(option.finalTraysToMake.large).toBeGreaterThanOrEqual(0);
    // The floor bit, so the trays now sum ABOVE the 11-tray target. Intended:
    // a negative tray count would be nonsense on a bench.
    const summed =
      option.finalTraysToMake.indi! +
      option.finalTraysToMake.small! +
      option.finalTraysToMake.large! +
      option.finalTraysToMake.boli!;
    expect(summed).toBeGreaterThan(option.targetTrays);
  });
});

describe('blank vs zero through the calculation (§2)', () => {
  it('a size typed as 0 participates fully; a blank size stays out', () => {
    const record = run({
      counts: counts({ sicSingles: 0, smallTrays: 5, largeTrays: 10, indiTrays: 2, boliTrays: 6 }),
      todayForecastRaw: 5.2,
      currentSalesRaw: 5.2,
      tomorrowForecastRaw: 3.75,
    });
    // sic typed 0 → have 0 → make = need 2 → 1 tray.
    expect(record.have.sic).toBe(0);
    expect(record.make.sic).toBe(2);
    expect(record.trays.sic).toBe(1);
  });

  it('sales filled but NOTHING counted yet leaves the batch total unknown, not zero', () => {
    // The sales card sits above the counts on the page, so this is the state
    // the owner passes through every afternoon. Every size contributing zero
    // must NOT read as a finished "nothing to make".
    const record = run({
      counts: counts(),
      todayForecastRaw: 11,
      currentSalesRaw: 4.2,
      tomorrowForecastRaw: 12,
    });
    expect(record.totalTrays).toBeNull();
    expect(record.exactBatches).toBeNull();
    expect(record.batchDown).toBeNull();
    expect(record.batchUp).toBeNull();
    // Tomorrow's need is still knowable — only the make is not.
    expect(record.need.indi).not.toBeNull();
  });

  it('one counted size is enough to give a batch total', () => {
    const record = run({
      counts: counts({ smallTrays: 5 }),
      todayForecastRaw: 11,
      currentSalesRaw: 4.2,
      tomorrowForecastRaw: 12,
    });
    expect(record.totalTrays).not.toBeNull();
    expect(record.totalTrays!).toBeGreaterThan(0);
  });

  it('closed tomorrow still answers zero with nothing counted — zero is the truth there', () => {
    const record = run({
      counts: counts(),
      todayForecastRaw: 11,
      currentSalesRaw: 4.2,
      tomorrowForecastRaw: 0,
    });
    expect(record.flags.closedTomorrow).toBe(true);
    expect(record.totalTrays).toBe(0);
  });

  it('an uncounted size has null use/left/make even with full sales', () => {
    const record = run({
      counts: counts({ smallTrays: 5 }),
      todayForecastRaw: 7.2,
      currentSalesRaw: 4.5,
      tomorrowForecastRaw: 9.1,
    });
    expect(record.use.indi).toBeNull();
    expect(record.left.indi).toBeNull();
    expect(record.make.indi).toBeNull();
    expect(record.trays.indi).toBeNull();
    // but its need is still knowable from the bible
    expect(record.need.indi).toBe(26);
  });
});

describe("Sicilian minimum (owner's rule: at least 1 unless 8+ on hand)", () => {
  // Current sales exactly meet today's forecast, so nothing is used tonight
  // (left = have) and the only thing that can move the make is the floor.
  // Tomorrow $16,000 → the 16,250 row → Sicilian need 6.
  const night = (sicSingles: number | null) =>
    runDoughCalculation(
      {
        date: '2026-03-10',
        counts: counts({
          indiTrays: 4, smallTrays: 30, largeTrays: 30,
          ...(sicSingles === null ? {} : { sicSingles }),
          boliTrays: 6,
        }),
        todayForecastRaw: 18,
        currentSalesRaw: 18,
        tomorrowForecastRaw: 16,
      },
      bibles,
      defaultConfig,
    );

  it('floors the make at 1 when fewer than 8 are on hand', () => {
    const short = night(7);
    expect(short.use.sic).toBe(0); // nothing sells tonight
    expect(short.need.sic).toBe(6);
    expect(short.left.sic).toBe(7); // already more than tomorrow wants…
    expect(short.make.sic).toBe(1); // …but the floor still asks for one
    expect(short.trays.sic).toBe(1);
  });

  it('waives the floor at exactly 8 on hand', () => {
    expect(night(8).make.sic).toBe(0);
    expect(night(20).make.sic).toBe(0);
  });

  it('never invents a make on a Sicilian nobody counted', () => {
    const uncounted = night(null);
    expect(uncounted.countedSizes.sic).toBe(false);
    expect(uncounted.make.sic).toBeNull();
    expect(uncounted.trays.sic).toBeNull();
  });

  it('is moot on a closed tomorrow — nothing gets made at all', () => {
    const closed = runDoughCalculation(
      {
        date: '2026-03-10',
        counts: counts({ indiTrays: 4, smallTrays: 30, largeTrays: 30, sicSingles: 1, boliTrays: 6 }),
        todayForecastRaw: 18,
        currentSalesRaw: 9,
        tomorrowForecastRaw: 0,
      },
      bibles,
      defaultConfig,
    );
    expect(closed.make.sic).toBe(0);
  });

  it('raises a make that is below the floor, never lowers one above it', () => {
    // 1 on hand against a need of 6 → a real make of 5, well clear of the floor.
    expect(night(1).make.sic).toBe(5);
  });
});

describe('the batch direction settles itself (a tapped pill still wins)', () => {
  /**
   * Drive the tray total with Large alone: counted at zero, with nothing sold
   * tonight, its make IS tomorrow's need and its trays are ceil(need / 6).
   * Every forecast below is an EXACT bible row, so the total does not shift
   * with the rounding direction. Boli adds exactly one more tray when counted
   * at 30 balls (36 − 30 = 6 → one tray).
   */
  const night = (opts: {
    tomorrow: number;
    slow: boolean;
    withBoli?: boolean;
    batchRound?: 'up' | 'down';
  }) =>
    runDoughCalculation(
      {
        date: '2026-03-10',
        counts: counts({
          largeTrays: 0,
          largeSingles: 0,
          ...(opts.withBoli ? { boliSingles: 30 } : {}),
        }),
        todayForecastRaw: opts.slow ? 12 : 18,
        currentSalesRaw: opts.slow ? 12 : 18,
        tomorrowForecastRaw: opts.tomorrow / 1000,
        batchRound: opts.batchRound,
      },
      bibles,
      defaultConfig,
    );

  it('a slow day is BOTH forecasts under $13,000', () => {
    expect(night({ tomorrow: 5700, slow: true }).rounding.slowDay).toBe(true);
    expect(night({ tomorrow: 5700, slow: false }).rounding.slowDay).toBe(false);
  });

  it('1 or 2 trays past a whole batch rounds DOWN on any day', () => {
    // Large need 72 → 12 trays (1 past 11); +1 Boli tray → 13 (2 past).
    const one = night({ tomorrow: 5700, slow: false });
    expect(one.totalTrays).toBe(12);
    expect(one.chosenBatchOption).toBe('down');

    const two = night({ tomorrow: 5700, slow: false, withBoli: true });
    expect(two.totalTrays).toBe(13);
    expect(two.chosenBatchOption).toBe('down');
  });

  it('3 to 5 past rounds UP on a busy day but DOWN on a slow one', () => {
    // Large needs 79 / 87 / 94 → 14 / 15 / 16 trays → 3, 4, 5 past a batch.
    for (const [tomorrow, total] of [[6300, 14], [6800, 15], [7200, 16]] as const) {
      expect(night({ tomorrow, slow: false }).totalTrays).toBe(total);
      expect(night({ tomorrow, slow: false }).chosenBatchOption).toBe('up');
      expect(night({ tomorrow, slow: true }).chosenBatchOption).toBe('down');
    }
  });

  it('6 past rounds UP even on a slow day', () => {
    // Large need 99 → 17 trays, 6 past a whole batch.
    const six = night({ tomorrow: 7800, slow: true });
    expect(six.totalTrays).toBe(17);
    expect(six.chosenBatchOption).toBe('up');
  });

  it('a tapped pill wins over the rule, and says it was not auto', () => {
    const auto = night({ tomorrow: 5700, slow: false });
    expect(auto.chosenBatchOption).toBe('down');
    expect(auto.rounding.batchesAuto).toBe(true);

    const tapped = night({ tomorrow: 5700, slow: false, batchRound: 'up' });
    expect(tapped.chosenBatchOption).toBe('up');
    expect(tapped.rounding.batchesAuto).toBe(false);
    expect(tapped.batchUp!.batches).toBe(2);
  });

  it('both options stay built, so either pill can be tapped', () => {
    const n = night({ tomorrow: 6300, slow: false });
    expect(n.batchDown!.batches).toBe(1);
    expect(n.batchUp!.batches).toBe(2);
  });
});
