/**
 * A small hand-drawn line chart: two series over the same x scale.
 *
 * There is no charting library here on purpose — the project ships no CDN
 * scripts and this is two paths, a pair of axes and some labels. Everything
 * is drawn from the design tokens so it cannot fall out of step with the app.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Series {
  label: string;
  points: Point[];
  color: string;
  /** The old bible is drawn quieter — the suggestion is what's being looked at. */
  muted?: boolean;
}

const W = 340;
const H = 210;
const PAD = { left: 36, right: 10, top: 12, bottom: 24 };
const PLOT = {
  x0: PAD.left,
  x1: W - PAD.right,
  y0: H - PAD.bottom,
  y1: PAD.top,
};

/**
 * Tangents for a MONOTONE cubic through the points (Fritsch–Carlson).
 *
 * A plain smooth curve overshoots between points: run it through a bible and
 * it draws humps of dough between two thresholds that neither threshold asks
 * for, and can dip below zero at the bottom end. Monotone cannot do either —
 * between two points it stays between their two values, which is the only
 * honest way to draw a lookup table as a curve.
 */
function monotoneTangents(pts: Point[]): number[] {
  const n = pts.length;
  if (n < 2) return new Array(n).fill(0);

  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    delta.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
  }

  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      // A flat run must stay flat, or the curve bulges off a level stretch.
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }
  return m;
}

/** The points as one cubic path, smoothed but never overshooting. */
function smoothPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const m = monotoneTangents(pts);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    d +=
      ` C ${pts[i].x + h} ${pts[i].y + m[i] * h}` +
      ` ${pts[i + 1].x - h} ${pts[i + 1].y - m[i + 1] * h}` +
      ` ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

/** Round the top of the scale up to something a person would say. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * pow) return step * pow;
  }
  return 10 * pow;
}

function tickLabel(value: number): string {
  if (value >= 1000) return `${value / 1000}k`;
  // Batch figures are fractional; ball counts never are.
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function LineChart(props: {
  series: Series[];
  xMax: number;
  /** Ticks along the bottom, in data units. */
  xTicks: number[];
  title: string;
}) {
  const all = props.series.flatMap((s) => s.points);
  const yMax = niceMax(Math.max(...all.map((p) => p.y), 0));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);

  const sx = (x: number) => PLOT.x0 + (x / props.xMax) * (PLOT.x1 - PLOT.x0);
  const sy = (y: number) => PLOT.y0 - (y / yMax) * (PLOT.y0 - PLOT.y1);
  const place = (pts: Point[]) => pts.map((p) => ({ x: sx(p.x), y: sy(p.y) }));

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={props.title}
      preserveAspectRatio="xMidYMid meet"
    >
      {yTicks.map((t) => (
        <g key={t}>
          <line className="chart-grid" x1={PLOT.x0} y1={sy(t)} x2={PLOT.x1} y2={sy(t)} />
          <text className="chart-tick" x={PLOT.x0 - 6} y={sy(t) + 3} textAnchor="end">
            {tickLabel(t)}
          </text>
        </g>
      ))}

      {props.xTicks.map((t) => (
        <text key={t} className="chart-tick" x={sx(t)} y={PLOT.y0 + 14} textAnchor="middle">
          {tickLabel(t)}
        </text>
      ))}

      <line className="chart-axis" x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x1} y2={PLOT.y0} />

      {props.series.map((s) => {
        const pts = place(s.points);
        if (pts.length === 0) return null;
        return (
          <g key={s.label} style={{ ['--line' as string]: s.color }}>
            <path
              className={`chart-line${s.muted ? ' muted' : ''}`}
              d={smoothPath(pts)}
              fill="none"
            />
            {/* Dots mark the real thresholds — between them the line is drawn, not measured. */}
            {!s.muted &&
              pts.map((p) => <circle key={p.x} className="chart-dot" cx={p.x} cy={p.y} r={2} />)}
          </g>
        );
      })}
    </svg>
  );
}
