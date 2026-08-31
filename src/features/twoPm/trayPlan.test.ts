import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config';
import { runDoughCalculation } from '../../core';
import { bibles, counts } from '../../core/testHelpers';
import type { DoughInputs } from '../../core/types';
import { trayPlan } from './trayPlan';

function night(partial: Partial<DoughInputs>) {
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

describe('the night the two cards disagreed', () => {
  /**
   * The owner's screenshot, Aug 2026: the Day's Work pills read LG 16 while
   * the By Size table read LG 15, because one card showed the trays after the
   * batch rounding and the other the plain plan. Both were right; nothing on
   * screen joined them up. These are the three numbers that now do.
   */
  // August, so the peach bible: tonight's $9,000 still to sell and tomorrow's
  // $10,500 are both exact rows in it (29/170/127/4 and 30/197/140/4), which
  // is what puts the screenshot's HAVE/USE/LEFT/NEED figures on screen.
  const record = night({
    date: '2026-08-24',
    counts: counts({ indiSingles: 24, smallSingles: 212, largeSingles: 181, sicSingles: 6, boliSingles: 18 }),
    todayForecastRaw: 12,
    currentSalesRaw: 3,
    tomorrowForecastRaw: 10.5,
  });
  const lines = trayPlan(record);

  it('is the night from the screenshot: 43 trays planned, rounded up to 44', () => {
    expect(record.totalTrays).toBe(43);
    expect(record.chosenBatchOption).toBe('up');
  });

  it('Large carries the whole +1: plan 15, round +1, final 16', () => {
    expect(lines.large).toEqual({ plan: 15, round: 1, final: 16 });
  });

  it('every size the rounding did not touch reads a plain 0', () => {
    expect(lines.indi).toEqual({ plan: 4, round: 0, final: 4 });
    expect(lines.small).toEqual({ plan: 20, round: 0, final: 20 });
    expect(lines.boli).toEqual({ plan: 3, round: 0, final: 3 });
  });

  it('the finals add up to the batches actually being made', () => {
    const made =
      lines.indi.final! + lines.small.final! + lines.large.final! + lines.sic.final! + lines.boli.final!;
    expect(made).toBe(record.batchUp!.targetTrays); // 44 = 4 × 11
  });
});

describe('trayPlan', () => {
  it('a round-DOWN night trims, and says so with negatives', () => {
    // Large alone drives the total: counted at zero with nothing sold tonight,
    // its make is tomorrow's need. 12 trays is 1 past a whole batch, so the
    // remainder rule rounds down on its own.
    const record = night({
      counts: counts({ largeTrays: 0, largeSingles: 0 }),
      todayForecastRaw: 18,
      currentSalesRaw: 18,
      tomorrowForecastRaw: 5.7,
    });
    expect(record.totalTrays).toBe(12);
    expect(record.chosenBatchOption).toBe('down');
    const lines = trayPlan(record);
    expect(lines.large.plan).toBe(12);
    expect(lines.large.round).toBe(-1);
    expect(lines.large.final).toBe(11);
  });

  it('reports the trays that REALLY moved when the floor at zero bites', () => {
    // A deep round-down asks Small for more trays than it has. buildBatchOption
    // floors it at 0, so the honest `round` is what Small could actually give
    // up — never the larger figure the split asked for.
    const record = night({
      counts: counts({ indiTrays: 0, smallTrays: 0, largeTrays: 0, sicSingles: 0, boliTrays: 6 }),
      todayForecastRaw: 12,
      currentSalesRaw: 12,
      tomorrowForecastRaw: 12,
    });
    const lines = trayPlan(record);
    for (const size of ['small', 'large'] as const) {
      const line = lines[size];
      expect(line.final).toBeGreaterThanOrEqual(0);
      // Whatever the split requested, the column reports final − plan exactly.
      expect(line.round).toBe(line.final! - line.plan!);
    }
  });

  it('with no batch direction the plan IS the final answer', () => {
    // Sales in, nothing counted: there are trays to name but no batch to round.
    const record = night({ todayForecastRaw: 11, currentSalesRaw: 4.2, tomorrowForecastRaw: 12 });
    expect(record.chosenBatchOption).toBeNull();
    const lines = trayPlan(record);
    for (const size of ['indi', 'small', 'large', 'sic', 'boli'] as const) {
      expect(lines[size].round).toBe(0);
      expect(lines[size].final).toBe(lines[size].plan);
    }
  });

  it('a size nobody counted stays blank on both ends, never a zero', () => {
    const record = night({
      counts: counts({ smallTrays: 5 }),
      todayForecastRaw: 7.2,
      currentSalesRaw: 4.5,
      tomorrowForecastRaw: 9.1,
    });
    const lines = trayPlan(record);
    expect(lines.indi).toEqual({ plan: null, round: 0, final: null });
    expect(lines.boli).toEqual({ plan: null, round: 0, final: null });
  });

  it('Sicilian and Boli never absorb a batch adjustment', () => {
    // Only Small and Large ever move, on any night in either direction.
    for (const tomorrow of [5.7, 6.3, 7.8, 16]) {
      const record = night({
        counts: counts({
          indiTrays: 1, smallTrays: 5, largeTrays: 4, sicSingles: 1, boliTrays: 2,
        }),
        todayForecastRaw: 18,
        currentSalesRaw: 9,
        tomorrowForecastRaw: tomorrow,
      });
      const lines = trayPlan(record);
      expect(lines.sic.round).toBe(0);
      expect(lines.boli.round).toBe(0);
      expect(lines.indi.round).toBe(0);
    }
  });
});
