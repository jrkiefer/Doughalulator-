import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { batchesForNeeds, perTraySizes, traysForNeeds } from './bibleCompare';
import { peachBible, regularBible } from '../data/bibles';

const cfg = defaultConfig;

describe('trays for a whole bible row', () => {
  it('divides plainly — it does not round each size up to a whole tray', () => {
    // Peach row 1: 20 indi, 56 small, 51 large, 2 sic.
    // 20/11 + 56/8 + 51/6 + 2/3 = 1.818… + 7 + 8.5 + 0.666… = 17.98…
    const row = peachBible.rows[0];
    expect(traysForNeeds(row, cfg)).toBeCloseTo(17.985, 3);
    // Rounding each size up first would say 2 + 7 + 9 + 1 = 19, which is
    // further from the binder's own reference figure of 17 for this row.
    expect(row.trays).toBe(17);
  });

  it('reads Sicilian off the make-tray, not ballsPerTray (which has no sic)', () => {
    const perTray = perTraySizes(cfg);
    expect(perTray.sic).toBe(cfg.sicMakeTraySize);
    expect(perTray).toEqual({ indi: 11, small: 8, large: 6, sic: 3 });
    // One size at a time, so a wrong divisor cannot hide in the sum.
    expect(traysForNeeds({ indi: 0, small: 0, large: 0, sic: 3 }, cfg)).toBe(1);
    expect(traysForNeeds({ indi: 11, small: 0, large: 0, sic: 0 }, cfg)).toBe(1);
    expect(traysForNeeds({ indi: 0, small: 8, large: 0, sic: 0 }, cfg)).toBe(1);
    expect(traysForNeeds({ indi: 0, small: 0, large: 6, sic: 0 }, cfg)).toBe(1);
  });

  it('is zero for a row that needs nothing', () => {
    expect(traysForNeeds({ indi: 0, small: 0, large: 0, sic: 0 }, cfg)).toBe(0);
    expect(batchesForNeeds({ indi: 0, small: 0, large: 0, sic: 0 }, cfg)).toBe(0);
  });
});

describe('batches for a whole bible row', () => {
  it('is the trays over a batch, to two decimal places', () => {
    const row = peachBible.rows[0];
    // 17.9848… / 11 = 1.63498…, which rounds down to 1.63 — not up.
    expect(batchesForNeeds(row, cfg)).toBe(1.63);
    // Exactly two decimals — never a long float tail on screen.
    expect(String(batchesForNeeds(row, cfg)).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('lands on a round number when the trays divide evenly', () => {
    // 11 trays' worth of Large alone = 66 balls = exactly one batch.
    expect(batchesForNeeds({ indi: 0, small: 0, large: 66, sic: 0 }, cfg)).toBe(1);
  });

  it('rises with sales across both bibles, with no dips', () => {
    for (const bible of [regularBible, peachBible]) {
      const series = bible.rows.map((row) => batchesForNeeds(row, cfg));
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
      }
      expect(series[0]).toBeGreaterThan(0);
    }
  });

  it('separates the two bibles at the same sales figure', () => {
    // $17,000 is in range for both; they are genuinely different books.
    const reg = regularBible.rows.find((r) => r.sales === 17000)!;
    const peach = peachBible.rows.find((r) => r.sales === 17000)!;
    expect(batchesForNeeds(reg, cfg)).not.toBe(batchesForNeeds(peach, cfg));
  });
});
