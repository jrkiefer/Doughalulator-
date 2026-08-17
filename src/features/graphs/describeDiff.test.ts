import { describe, expect, it } from 'vitest';
import { describeDifference, pairRows, type DiffRow } from './describeDiff';

const row = (sales: number, now: number | null, suggested: number | null): DiffRow => ({
  sales,
  now,
  suggested,
});

describe('pairing the two bibles', () => {
  it('keeps only thresholds both sides speak for, in sales order', () => {
    const pairs = pairRows([
      row(9000, 100, 90),
      row(3750, 50, 55),
      row(6000, 70, null), // no suggestion yet
      row(7000, null, 80), // no bible row
    ]);
    expect(pairs.map((p) => p.sales)).toEqual([3750, 9000]);
    expect(pairs[0].diff).toBe(5);
    expect(pairs[1].diff).toBe(-10);
  });
});

describe('the one-line reading', () => {
  it('says nothing at all when there is no suggestion', () => {
    expect(describeDifference([row(3750, 50, null)], 'balls')).toBeNull();
    expect(describeDifference([], 'balls')).toBeNull();
  });

  it('calls out a bible that is already right', () => {
    const rows = [row(3750, 50, 50), row(9000, 100, 100)];
    expect(describeDifference(rows, 'balls')).toContain('matches the bible you already have');
  });

  it('names the biggest gap when every row points the same way', () => {
    const rows = [row(3750, 50, 46), row(9000, 100, 88), row(20750, 276, 243)];
    const said = describeDifference(rows, 'balls', 'Small')!;
    expect(said).toContain('make less Small');
    expect(said).toContain('all the way up');
    expect(said).toContain('$20,750'); // the biggest gap, not the last row by luck
    expect(said).toContain('33 fewer');
  });

  it('handles the other direction too', () => {
    const rows = [row(3750, 50, 54), row(9000, 100, 112)];
    const said = describeDifference(rows, 'balls', 'Indi')!;
    expect(said).toContain('make more Indi');
    expect(said).toContain('12 more');
  });

  it('reports where it turns over when the two cross', () => {
    const rows = [row(3750, 50, 58), row(9000, 100, 104), row(15000, 200, 180), row(20750, 276, 243)];
    const said = describeDifference(rows, 'balls', 'Small')!;
    expect(said).toContain('make more Small below $15,000');
    expect(said).toContain('less above it');
    expect(said).toContain('33 fewer at $20,750');
  });

  it('does not call a rounding wobble a difference in batches', () => {
    // 0.004 apart is the two-decimal rounding, not a real disagreement.
    const rows = [row(3750, 1.63, 1.634), row(9000, 4.2, 4.198)];
    expect(describeDifference(rows, 'batches')).toContain('matches the bible you already have');
  });

  it('keeps two decimals for batches and whole numbers for balls', () => {
    const batches = describeDifference([row(3750, 1.6, 2.35), row(9000, 4.2, 4.9)], 'batches')!;
    expect(batches).toContain('0.75 more');
    const balls = describeDifference([row(3750, 50, 46)], 'balls')!;
    expect(balls).toContain('4 fewer');
    // No decimal figures anywhere — balls are whole things.
    expect(balls).not.toMatch(/\d\.\d/);
  });
});
