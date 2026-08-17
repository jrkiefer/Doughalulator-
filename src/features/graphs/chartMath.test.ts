import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config';
import { batchesForNeeds } from '../../core';
import { regularBible, peachBible } from '../../data/bibles';
import {
  monotoneTangents,
  nearestIndex,
  niceMax,
  niceStep,
  smoothPath,
  snugDomain,
  tickStep,
  ticksFor,
  type Point,
} from './chartMath';

/** Walk a cubic Bézier segment and report the extreme y it reaches. */
function segmentRange(p0: Point, c1: Point, c2: Point, p1: Point) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const u = 1 - t;
    const y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y;
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return { lo, hi };
}

/** Rebuild the control points the path uses, so the curve itself is checked. */
function segments(pts: Point[]) {
  const m = monotoneTangents(pts);
  return pts.slice(0, -1).map((p, i) => {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    return {
      p0: p,
      c1: { x: p.x + h, y: p.y + m[i] * h },
      c2: { x: pts[i + 1].x - h, y: pts[i + 1].y - m[i + 1] * h },
      p1: pts[i + 1],
    };
  });
}

describe('the smoothing never invents dough between two thresholds', () => {
  const cases: [string, Point[]][] = [
    ['a steep step then a plateau', [
      { x: 0, y: 10 }, { x: 1, y: 90 }, { x: 2, y: 92 }, { x: 3, y: 92 }, { x: 4, y: 93 },
    ]],
    ['a flat run', [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }]],
    ['a single spike', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 80 }, { x: 3, y: 0 }, { x: 4, y: 0 }]],
    ['a hard drop to zero', [{ x: 0, y: 40 }, { x: 1, y: 20 }, { x: 2, y: 0 }, { x: 3, y: 0 }]],
  ];

  for (const [name, pts] of cases) {
    it(`stays between its neighbours: ${name}`, () => {
      for (const s of segments(pts)) {
        const { lo, hi } = segmentRange(s.p0, s.c1, s.c2, s.p1);
        const floor = Math.min(s.p0.y, s.p1.y);
        const ceiling = Math.max(s.p0.y, s.p1.y);
        expect(lo).toBeGreaterThanOrEqual(floor - 1e-9);
        expect(hi).toBeLessThanOrEqual(ceiling + 1e-9);
      }
    });
  }

  it('holds for every real bible series, so no line can dip below zero', () => {
    const cfg = defaultConfig;
    for (const bible of [regularBible, peachBible]) {
      const series: Point[][] = [
        bible.rows.map((r) => ({ x: r.sales, y: r.indi })),
        bible.rows.map((r) => ({ x: r.sales, y: r.small })),
        bible.rows.map((r) => ({ x: r.sales, y: r.large })),
        bible.rows.map((r) => ({ x: r.sales, y: r.sic })),
        bible.rows.map((r) => ({ x: r.sales, y: batchesForNeeds(r, cfg) })),
      ];
      for (const pts of series) {
        for (const s of segments(pts)) {
          const { lo, hi } = segmentRange(s.p0, s.c1, s.c2, s.p1);
          expect(lo).toBeGreaterThanOrEqual(Math.min(s.p0.y, s.p1.y) - 1e-9);
          expect(hi).toBeLessThanOrEqual(Math.max(s.p0.y, s.p1.y) + 1e-9);
          expect(lo).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('draws something sensible for one point or none', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 3, y: 4 }])).toBe('M 3 4');
    expect(smoothPath([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toContain('C');
  });
});

describe('the value scale keeps the plot full', () => {
  it('leaves under 15% headroom, where the old ladder threw away a quarter', () => {
    for (const value of [7.6, 3.1, 44, 276, 0.9, 17.4, 155]) {
      const top = niceMax(value);
      expect(top).toBeGreaterThanOrEqual(value);
      expect((top - value) / top).toBeLessThan(0.15);
    }
  });

  it('no longer sends 7.6 all the way to 10', () => {
    expect(niceMax(7.6)).toBe(8);
    expect(niceMax(10)).toBe(10);
    expect(niceMax(0)).toBe(1);
  });
});

describe('the sales axis sits just outside the bible', () => {
  it('contains every threshold, with room at both ends', () => {
    for (const bible of [regularBible, peachBible]) {
      const sales = bible.rows.map((r) => r.sales);
      const { min, max } = snugDomain(sales);
      expect(min).toBeLessThan(Math.min(...sales));
      expect(max).toBeGreaterThan(Math.max(...sales));
      // …and stays snug: the bible fills most of the axis, unlike 0–23,000.
      const covered = (Math.max(...sales) - Math.min(...sales)) / (max - min);
      expect(covered).toBeGreaterThan(0.8);
      expect(min).toBeGreaterThanOrEqual(0);
    }
  });

  it('rounds to figures a person would say out loud', () => {
    const { min, max } = snugDomain(regularBible.rows.map((r) => r.sales));
    expect(min % 500).toBe(0);
    expect(max % 500).toBe(0);
  });

  it('survives a single point and an empty series', () => {
    expect(snugDomain([])).toEqual({ min: 0, max: 1 });
    const one = snugDomain([5000]);
    expect(one.min).toBeLessThan(5000);
    expect(one.max).toBeGreaterThan(5000);
  });
});

describe('ticks and snapping', () => {
  it('lays round ticks inside the domain', () => {
    const ticks = ticksFor(3500, 21000, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(3500);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(21000);
    expect(ticks.every((t) => t % niceStep(21000 - 3500) === 0)).toBe(true);
  });

  it('asks for about as many ticks as it was told to', () => {
    // The first cut reused the domain-snapping step here and produced a $500
    // stride across $17,500 — thirty-five labels overlapping into one grey
    // smear. Divisibility alone passed that; the COUNT is what catches it.
    for (const bible of [regularBible, peachBible]) {
      const sales = bible.rows.map((r) => r.sales);
      const { min, max } = snugDomain(sales);
      const ticks = ticksFor(min, max, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
    // …and across a spread of ranges, so it cannot regress at one scale only.
    for (const [lo, hi] of [[0, 10], [0, 300], [3500, 21000], [2500, 18000], [0, 1.6]]) {
      const ticks = ticksFor(lo, hi, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(8);
    }
  });

  it('steps by a figure a person would read off an axis', () => {
    expect(tickStep(17500, 5)).toBe(5000);
    expect(tickStep(300, 5)).toBe(100);
    expect(tickStep(8, 5)).toBe(2);
  });

  it('snaps the crosshair to the closest threshold', () => {
    const xs = [3750, 4000, 4400, 5000];
    expect(nearestIndex(xs, 3760)).toBe(0);
    expect(nearestIndex(xs, 4300)).toBe(2);
    expect(nearestIndex(xs, 99999)).toBe(3);
    expect(nearestIndex(xs, 0)).toBe(0);
  });
});
