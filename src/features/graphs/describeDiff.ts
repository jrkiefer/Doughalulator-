/**
 * The graph in one sentence.
 *
 * A chart answers "what does it look like"; the owner's question is "how is the
 * new bible different from mine". That is a sentence, and the app already
 * answers questions that way everywhere else — the EON outlook ends in plain
 * words rather than leaving the reader to total the rows themselves.
 */

export interface DiffRow {
  sales: number;
  now: number | null;
  suggested: number | null;
}

export interface Paired {
  sales: number;
  now: number;
  suggested: number;
  diff: number;
}

/** Only the thresholds where both bibles have something to say. */
export function pairRows(rows: DiffRow[]): Paired[] {
  return rows
    .filter((r): r is Paired & DiffRow => r.now !== null && r.suggested !== null)
    .map((r) => ({ sales: r.sales, now: r.now, suggested: r.suggested, diff: r.suggested - r.now }))
    .sort((a, b) => a.sales - b.sales);
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Balls are whole; batches carry two places. */
function amount(value: number, unit: 'balls' | 'batches'): string {
  const v = Math.abs(value);
  return unit === 'batches' ? v.toFixed(2) : String(Math.round(v));
}

/**
 * A one-line reading of the gap, or null when there is nothing to say yet.
 * Deliberately about the SHAPE of the difference — everywhere / nowhere / above
 * this much — because that is what decides whether the bible is worth changing.
 */
export function describeDifference(
  rows: DiffRow[],
  unit: 'balls' | 'batches',
  noun = 'dough',
): string | null {
  const pairs = pairRows(rows);
  if (pairs.length === 0) return null;

  // A batch figure lands on 0.005 by rounding alone; that is not a difference.
  const tol = unit === 'batches' ? 0.005 : 0.5;
  const more = pairs.filter((p) => p.diff > tol);
  const fewer = pairs.filter((p) => p.diff < -tol);
  if (more.length === 0 && fewer.length === 0) {
    return 'The suggestion matches the bible you already have.';
  }

  const biggest = pairs.reduce((a, b) => (Math.abs(b.diff) >= Math.abs(a.diff) ? b : a));
  const most = `${amount(biggest.diff, unit)} ${biggest.diff > 0 ? 'more' : 'fewer'} at ${money(biggest.sales)}`;

  if (fewer.length > 0 && more.length === 0) {
    return `Your nights say make less ${noun} than the bible does, all the way up — most at ${money(biggest.sales)}, ${amount(biggest.diff, unit)} fewer.`;
  }
  if (more.length > 0 && fewer.length === 0) {
    return `Your nights say make more ${noun} than the bible does, all the way up — most at ${money(biggest.sales)}, ${amount(biggest.diff, unit)} more.`;
  }

  // Mixed: the useful fact is where it turns over, not the raw counts.
  const turn = pairs.find((p, i) => i > 0 && Math.sign(p.diff) !== Math.sign(pairs[i - 1].diff));
  const lowSideMore = pairs[0].diff > 0;
  if (turn) {
    return `Your nights say make ${lowSideMore ? 'more' : 'less'} ${noun} below ${money(turn.sales)} and ${lowSideMore ? 'less' : 'more'} above it — biggest gap ${most}.`;
  }
  return `Your nights and the bible disagree in both directions — biggest gap ${most}.`;
}
