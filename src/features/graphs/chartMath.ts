/**
 * The chart's geometry, kept out of the component so it can be tested rather
 * than only looked at. Nothing in here knows about React or the DOM: points
 * in, path strings and tick positions out.
 *
 * A note on the `!` assertions through this file: with
 * `noUncheckedIndexedAccess` on, every indexed read is `T | undefined` even
 * inside a loop whose bounds guarantee the element exists. Where a bound or
 * an early return establishes the invariant, the assertion states it rather
 * than papering over a real doubt — each one sits inside a loop shaped so it
 * cannot miss.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Tangents for a MONOTONE cubic through the points (Fritsch–Carlson).
 *
 * An ordinary smooth curve overshoots between points. Run one through a bible
 * and it draws humps of dough between two thresholds that neither threshold
 * asks for, and dips below zero at the bottom end. Monotone cannot do either:
 * between any two points the curve stays between their two values, which is
 * the only honest way to draw a lookup table as a curve.
 */
export function monotoneTangents(pts: Point[]): number[] {
  const n = pts.length;
  if (n < 2) return new Array<number>(n).fill(0);

  // The slope of each straight segment between neighbouring points.
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const dx = q.x - p.x;
    delta.push(dx === 0 ? 0 : (q.y - p.y) / dx);
  }

  // First guess at each point's tangent: the segment slope at the ends, the
  // average of the two neighbouring slopes in the middle — EXCEPT at a local
  // extremum (the slopes change sign), which must be flat. That flatness is
  // Fritsch–Carlson's own rule, not an optimisation: averaging happens to
  // work when a spike is symmetric, but an asymmetric peak would tilt the
  // tangent and let the curve overshoot past the peak — exactly what
  // "monotone" promises cannot happen. Today's series are monotone so the
  // clamp never fires, but the guarantee must not depend on the data staying
  // polite.
  const m: number[] = new Array<number>(n);
  m[0] = delta[0]!;
  m[n - 1] = delta[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const before = delta[i - 1]!;
    const after = delta[i]!;
    m[i] = before * after <= 0 ? 0 : (before + after) / 2;
  }

  // Second pass: keep each tangent inside the Fritsch–Carlson circle
  // (a² + b² ≤ 9, in units of the segment slope). Outside it, the cubic
  // between the two points stops being monotone even with well-signed
  // tangents, so both ends are scaled back onto the circle together.
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i]!;
    if (d === 0) {
      // A flat run must stay flat, or the curve bulges off a level stretch.
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d;
    const b = m[i + 1]! / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }
  return m;
}

/**
 * The points as one smoothed cubic path. Each Bézier segment places its two
 * control points a third of the way in along x — the standard Hermite→Bézier
 * conversion — with their heights set by the monotone tangents above.
 */
export function smoothPath(pts: Point[]): string {
  const first = pts[0];
  if (first === undefined) return '';
  if (pts.length === 1) return `M ${first.x} ${first.y}`;
  const m = monotoneTangents(pts);
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const h = (q.x - p.x) / 3;
    d +=
      ` C ${p.x + h} ${p.y + m[i]! * h}` +
      ` ${q.x - h} ${q.y - m[i + 1]! * h}` +
      ` ${q.x} ${q.y}`;
  }
  return d;
}

/**
 * The band between two curves, as one closed shape: out along a, back along
 * b reversed. The return leg re-derives its tangents from the REVERSED
 * points so the band's lower edge is the same curve the line itself draws —
 * mirroring the forward tangents would flip their signs subtly wrong.
 */
export function bandPath(a: Point[], b: Point[]): string {
  if (a.length < 2 || b.length < 2) return '';
  const back = [...b].reverse();
  const m = monotoneTangents(back);
  const start = back[0]!;
  let d = smoothPath(a) + ` L ${start.x} ${start.y}`;
  for (let i = 0; i < back.length - 1; i++) {
    const p = back[i]!;
    const q = back[i + 1]!;
    const h = (q.x - p.x) / 3;
    d +=
      ` C ${p.x + h} ${p.y + m[i]! * h}` +
      ` ${q.x - h} ${q.y - m[i + 1]! * h}` +
      ` ${q.x} ${q.y}`;
  }
  return `${d} Z`;
}

/**
 * The top of the value scale: a round number just above the data.
 *
 * The steps are close together on purpose. A coarse ladder (1, 2, 5, 10) sent a
 * max of 7.6 up to 10 and threw away a quarter of the plot's height, which
 * flattens both lines and is most of why the first version read as cramped.
 */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10];
  for (const step of steps) {
    // toPrecision cleans the float noise a step × power multiply leaves
    // behind (1.2 × 10 → 11.999999…), so the axis label prints round.
    if (value <= step * pow) return Number((step * pow).toPrecision(12));
  }
  return 10 * pow;
}

/**
 * A sales range that starts just below the first threshold and ends just above
 * the last (the owner's words), snapped outward to a round step so the ticks
 * stay speakable. Never the whole 0–23,000: the bibles occupy the middle of
 * that and the lines end up squeezed into two-thirds of the width.
 */
export function snugDomain(values: number[], pad = 0.04): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return { min: Math.max(0, lo - 1), max: hi + 1 };
  const margin = (hi - lo) * pad;
  const step = niceStep(hi - lo);
  return {
    min: Math.max(0, Math.floor((lo - margin) / step) * step),
    max: Math.ceil((hi + margin) / step) * step,
  };
}

/** A round increment for a range of this size — 500 and 1,000 for our sales. */
export function niceStep(range: number): number {
  const pow = 10 ** Math.floor(Math.log10(range));
  for (const step of [0.05, 0.1, 0.25, 0.5]) {
    if (range / (step * pow) <= 40) return step * pow;
  }
  return pow;
}

/**
 * The gap between ticks: a 1 / 2 / 2.5 / 5 × 10ⁿ step giving roughly `count`
 * of them. Deliberately NOT `niceStep`, which exists to snap the domain to a
 * round edge — borrowing it here asked for a $500 step across $17,500 and drew
 * thirty-five overlapping labels into one grey smear.
 */
export function tickStep(range: number, count: number): number {
  const rough = range / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(rough));
  for (const m of [1, 2, 2.5, 5]) {
    if (rough <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/**
 * Evenly spaced round ticks inside a domain. The `step * 0.001` slack on the
 * upper bound keeps a tick that lands exactly on `max` from being lost to
 * float noise; toPrecision cleans each value for printing the same way.
 */
export function ticksFor(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = tickStep(max - min, count);
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 0.001; t += step) {
    out.push(Number(t.toPrecision(12)));
  }
  return out.length >= 2 ? out : [min, max];
}

/** The datum nearest an x position — what the crosshair snaps to. */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0;
  let bestGap = Infinity;
  xs.forEach((v, i) => {
    const gap = Math.abs(v - x);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}
