/**
 * Two series over one sales axis, drawn by hand.
 *
 * No charting library: the project ships no CDN scripts, and this is two paths,
 * a wash between them and a pair of axes. Everything comes from the design
 * tokens, so it cannot drift from the rest of the app.
 *
 * The reference line is near-black rather than grey. That is not taste — with
 * the old warm grey, three of the five measures fell below the floor at which
 * two lines can be told apart by someone with ordinary colour vision, and two
 * fell below the colour-blind floor as well.
 */
import { useRef } from 'react';
import {
  bandPath,
  nearestIndex,
  niceMax,
  smoothPath,
  snugDomain,
  ticksFor,
  type Point,
} from './chartMath';

export type { Point };

export interface Series {
  label: string;
  points: Point[];
  color: string;
  /** The bible as it stands: present, but not the thing being looked at. */
  reference?: boolean;
}

const W = 340;
const H = 232;
const PAD = { left: 32, right: 48, top: 26, bottom: 36 };
const PLOT = { x0: PAD.left, x1: W - PAD.right, y0: H - PAD.bottom, y1: PAD.top };
/** Below this the end labels would sit on top of each other. */
const LABEL_MIN_GAP = 17;

function fmtValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0$/, '');
}

function fmtSales(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
}

export function LineChart(props: {
  series: Series[];
  /** Which datum the crosshair is on, or null for none. */
  activeIndex: number | null;
  onActive: (index: number | null) => void;
  /** Unit for the value axis — "BALLS" or "BATCHES". */
  unit: string;
  title: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawn = props.series.filter((s) => s.points.length > 0);
  const allX = [...new Set(drawn.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const domain = snugDomain(allX);
  const yMax = niceMax(Math.max(...drawn.flatMap((s) => s.points.map((p) => p.y)), 0));
  // Round ticks up to the ceiling rather than quarters OF it: quartering 350
  // gave 87.5 / 175 / 262.5, which nobody reads off an axis. The topmost
  // gridline sitting below the ceiling is normal and costs nothing.
  const yTicks = ticksFor(0, yMax, 4);
  const xTicks = ticksFor(domain.min, domain.max, 5);

  const sx = (x: number) =>
    PLOT.x0 + ((x - domain.min) / (domain.max - domain.min)) * (PLOT.x1 - PLOT.x0);
  const sy = (y: number) => PLOT.y0 - (y / yMax) * (PLOT.y0 - PLOT.y1);
  const place = (pts: Point[]) => pts.map((p) => ({ x: sx(p.x), y: sy(p.y) }));

  // The gap between the two lines is the whole point of the chart, so it gets
  // drawn rather than left for the eye to measure. Only where both series
  // exist, and only at the sales figures both of them cover.
  const [first, second] = drawn;
  const shared =
    first && second
      ? allX.filter(
          (x) =>
            first.points.some((p) => p.x === x) && second.points.some((p) => p.x === x),
        )
      : [];
  // Safe by construction: `at` is only called for x values `shared` proved
  // present in both series.
  const at = (s: Series, x: number) => s.points.find((p) => p.x === x)!;
  const band =
    first && second && shared.length > 1
      ? bandPath(
          place(shared.map((x) => at(first, x))),
          place(shared.map((x) => at(second, x))),
        )
      : '';
  const bandColor = second?.color ?? 'var(--ink)';

  // End labels: the value only. The series name is the legend's job, and a name
  // at the line end would need more width than a phone has to spare.
  const ends = drawn
    .map((s) => {
      const last = s.points[s.points.length - 1]!; // drawn ⇒ points.length > 0
      return { series: s, x: sx(last.x), y: sy(last.y), value: last.y };
    })
    .sort((a, b) => a.y - b.y);
  const labelY = ends.map((e) => e.y);
  if (labelY.length === 2 && labelY[1]! - labelY[0]! < LABEL_MIN_GAP) {
    const mid = (labelY[0]! + labelY[1]!) / 2;
    const ceiling = PLOT.y1 + 4;
    let top = mid - LABEL_MIN_GAP / 2;
    let bottom = mid + LABEL_MIN_GAP / 2;
    // Push the other one along when either end hits its limit. Clamping only
    // the one that overshot silently closed the gap again — which is how two
    // near-equal Batches figures ended up printed over each other.
    if (top < ceiling) {
      top = ceiling;
      bottom = top + LABEL_MIN_GAP;
    }
    if (bottom > PLOT.y0) {
      bottom = PLOT.y0;
      top = bottom - LABEL_MIN_GAP;
    }
    labelY[0] = top;
    labelY[1] = bottom;
  }

  function pick(clientX: number) {
    const svg = svgRef.current;
    if (!svg || allX.length === 0) return;
    const box = svg.getBoundingClientRect();
    const inSvg = ((clientX - box.left) / box.width) * W;
    const value = domain.min + ((inSvg - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * (domain.max - domain.min);
    props.onActive(nearestIndex(allX, value));
  }

  // An index that outlived its data (a reload shrank the series while a
  // reading was up) resolves to null rather than crashing the readout.
  const activeX = props.activeIndex === null ? null : (allX[props.activeIndex] ?? null);

  return (
    <svg
      ref={svgRef}
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={props.title}
      tabIndex={0}
      preserveAspectRatio="xMidYMid meet"
      // Tapping reads a value; it should not also park a focus ring round the
      // chart. Keyboard users still reach it with Tab, and get the ring then.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        // Read first, capture second. setPointerCapture throws for a pointer the
        // browser no longer considers active, and a tap that reads nothing is
        // exactly the failure this handler exists to prevent.
        pick(e.clientX);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // No capture — a drag just stops tracking once it leaves the chart.
        }
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) pick(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const from = props.activeIndex ?? (step > 0 ? -1 : allX.length);
        props.onActive(Math.min(allX.length - 1, Math.max(0, from + step)));
      }}
    >
      {/* Value axis: the unit sits above it, level — turned on its side it is
          unreadable at this size. */}
      <text className="chart-axis-title" x={2} y={12}>
        {props.unit}
      </text>

      {yTicks.map((t) => (
        <g key={t}>
          <line className="chart-grid" x1={PLOT.x0} y1={sy(t)} x2={PLOT.x1} y2={sy(t)} />
          <text className="chart-tick" x={PLOT.x0 - 5} y={sy(t) + 3} textAnchor="end">
            {fmtValue(t)}
          </text>
        </g>
      ))}

      {band && <path className="chart-band" d={band} style={{ ['--line' as string]: bandColor }} />}

      {activeX !== null && (
        <line className="chart-crosshair" x1={sx(activeX)} y1={PLOT.y1} x2={sx(activeX)} y2={PLOT.y0} />
      )}

      {drawn.map((s) => {
        const pts = place(s.points);
        const end = pts[pts.length - 1]!; // drawn ⇒ points.length > 0
        const active = activeX === null ? null : s.points.find((p) => p.x === activeX);
        return (
          <g key={s.label} style={{ ['--line' as string]: s.color }}>
            <path
              className={`chart-line${s.reference ? ' reference' : ''}`}
              d={smoothPath(pts)}
              fill="none"
            />
            {/* One marker at the end, ringed in the surface colour so it stays
                legible where the two lines cross. */}
            <circle className="chart-end" cx={end.x} cy={end.y} r={4} />
            {active && <circle className="chart-active" cx={sx(active.x)} cy={sy(active.y)} r={4.5} />}
          </g>
        );
      })}

      {ends.map((e, i) => {
        const y = labelY[i]!; // labelY is built index-for-index from ends
        return (
          <g key={e.series.label}>
            {/* A leader line only when the label was pushed off its point —
                an untouched label needs no explanation. */}
            {Math.abs(y - e.y) > 1 && (
              <line className="chart-leader" x1={e.x + 5} y1={e.y} x2={PLOT.x1 + 10} y2={y} />
            )}
            <text className="chart-end-label" x={PLOT.x1 + 12} y={y + 3}>
              {fmtValue(e.value)}
            </text>
          </g>
        );
      })}

      <line className="chart-axis" x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x1} y2={PLOT.y0} />

      {xTicks.map((t) => (
        <text key={t} className="chart-tick" x={sx(t)} y={PLOT.y0 + 13} textAnchor="middle">
          {fmtSales(t)}
        </text>
      ))}

      <text className="chart-axis-title" x={(PLOT.x0 + PLOT.x1) / 2} y={H - 6} textAnchor="middle">
        SALES $
      </text>
    </svg>
  );
}
