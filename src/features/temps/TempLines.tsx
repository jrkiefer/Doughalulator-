/**
 * The temp line graph: time across the bottom (the last few reading moments,
 * slot over date), °F up the side on a FIXED 28–60 scale split at 40 into a
 * fridge-safe band and a danger band. One line per chosen station, straight
 * segments — three points is a record, not a curve.
 *
 * A reading past 60 does not stretch the scale: it becomes an arrow out the
 * top with its true figure and the "Check foods / Check chicken" warning
 * (owner's spec, Aug 2026). Below 28 — which nothing should ever read; the
 * freezer runs ~32 — mirrors it quietly out the bottom.
 */
import { useRef } from 'react';
import { nearestIndex } from '../graphs/chartMath';
import { fmtTemp, SAFE_MAX, SCALE_MAX, SCALE_MIN, type TimeColumn } from './tempChart';

export interface TempSeries {
  station: string;
  color: string;
  /** One entry per column; null where this station was not read. */
  temps: (number | null)[];
}

const W = 340;
const H = 216;
const PAD = { left: 30, right: 12, top: 26, bottom: 40 };
const PLOT = { x0: PAD.left, x1: W - PAD.right, y0: H - PAD.bottom, y1: PAD.top };
/** Columns stay clear of the plot edges so end dots and arrows have room. */
const COL_INSET = 34;

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function TempLines(props: {
  columns: TimeColumn[];
  series: TempSeries[];
  activeIndex: number | null;
  onActive: (index: number | null) => void;
  title: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { columns, series } = props;
  const n = columns.length;

  const colX = (i: number) =>
    n === 1
      ? (PLOT.x0 + PLOT.x1) / 2
      : PLOT.x0 + COL_INSET + (i * (PLOT.x1 - PLOT.x0 - 2 * COL_INSET)) / (n - 1);
  const xs = columns.map((_, i) => colX(i));
  const sy = (t: number) =>
    PLOT.y0 - ((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * (PLOT.y0 - PLOT.y1);
  /** Where a point draws: out-of-range readings sit on the edge, arrowed. */
  const py = (t: number) => sy(Math.min(SCALE_MAX, Math.max(SCALE_MIN, t)));

  const anyOver = series.some((s) => s.temps.some((t) => t !== null && t > SCALE_MAX));

  function pick(clientX: number) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const box = svg.getBoundingClientRect();
    const inSvg = ((clientX - box.left) / box.width) * W;
    props.onActive(nearestIndex(xs, inSvg));
  }

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
        // Read first, capture second — setPointerCapture throws for a pointer
        // the browser no longer considers active.
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
        const from = props.activeIndex ?? (step > 0 ? -1 : n);
        props.onActive(Math.min(n - 1, Math.max(0, from + step)));
      }}
    >
      <text className="chart-axis-title" x={2} y={12}>
        °F
      </text>

      {/* The two zones, told apart before any line is read. */}
      <rect
        className="temp-band-good"
        x={PLOT.x0}
        y={sy(SAFE_MAX)}
        width={PLOT.x1 - PLOT.x0}
        height={PLOT.y0 - sy(SAFE_MAX)}
      />
      <rect
        className="temp-band-danger"
        x={PLOT.x0}
        y={PLOT.y1}
        width={PLOT.x1 - PLOT.x0}
        height={sy(SAFE_MAX) - PLOT.y1}
      />
      <text className="temp-band-label good" x={PLOT.x0 + 5} y={PLOT.y0 - 5}>
        GOOD
      </text>
      <text className="temp-band-label danger" x={PLOT.x0 + 5} y={sy(SAFE_MAX) - 5}>
        DANGER ZONE
      </text>

      {[SCALE_MIN, SAFE_MAX, SCALE_MAX].map((t) => (
        <g key={t}>
          <line className="chart-grid" x1={PLOT.x0} y1={sy(t)} x2={PLOT.x1} y2={sy(t)} />
          <text className="chart-tick" x={PLOT.x0 - 5} y={sy(t) + 3} textAnchor="end">
            {t}
          </text>
        </g>
      ))}

      {props.activeIndex !== null && xs[props.activeIndex] !== undefined && (
        <line
          className="chart-crosshair"
          x1={xs[props.activeIndex]}
          y1={PLOT.y1}
          x2={xs[props.activeIndex]}
          y2={PLOT.y0}
        />
      )}

      {series.map((s) => {
        // Consecutive readings join up; a missed slot breaks the line.
        const runs: string[] = [];
        let run: string[] = [];
        s.temps.forEach((t, i) => {
          if (t === null) {
            if (run.length > 1) runs.push(`M ${run.join(' L ')}`);
            run = [];
          } else {
            run.push(`${colX(i)} ${py(t)}`);
          }
        });
        if (run.length > 1) runs.push(`M ${run.join(' L ')}`);

        return (
          <g key={s.station} style={{ ['--line' as string]: s.color }}>
            {runs.length > 0 && <path className="chart-line" d={runs.join(' ')} fill="none" />}
            {s.temps.map((t, i) => {
              if (t === null) return null;
              const x = colX(i);
              if (t > SCALE_MAX || t < SCALE_MIN) {
                // Out the top (or bottom): an arrow at the edge, the true
                // figure beside it — never a silently clamped dot.
                const over = t > SCALE_MAX;
                const edge = over ? PLOT.y1 : PLOT.y0;
                const tip = over ? edge - 9 : edge + 9;
                const flip = x > (PLOT.x0 + PLOT.x1) / 2;
                return (
                  <g key={i}>
                    <path
                      className={`temp-arrow${over ? ' over' : ''}`}
                      d={`M ${x} ${tip} L ${x - 4.5} ${edge} L ${x + 4.5} ${edge} Z`}
                    />
                    <text
                      className={`temp-arrow-value${over ? ' over' : ''}`}
                      x={flip ? x - 8 : x + 8}
                      y={over ? edge - 2 : edge + 7}
                      textAnchor={flip ? 'end' : 'start'}
                    >
                      {fmtTemp(t)}
                    </text>
                  </g>
                );
              }
              const active = props.activeIndex === i;
              return (
                <circle
                  key={i}
                  className={active ? 'chart-active' : 'chart-end'}
                  cx={x}
                  cy={py(t)}
                  r={active ? 4.5 : 3.5}
                />
              );
            })}
          </g>
        );
      })}

      {anyOver && (
        <text className="temp-warning" x={PLOT.x1 - 5} y={PLOT.y1 + 13} textAnchor="end">
          Check foods
          <tspan x={PLOT.x1 - 5} dy={12}>
            Check chicken
          </tspan>
        </text>
      )}

      <line className="chart-axis" x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x1} y2={PLOT.y0} />

      {columns.map((c, i) => (
        <g key={`${c.date}|${c.slot}`}>
          <text className="temp-x-slot" x={xs[i]} y={PLOT.y0 + 15} textAnchor="middle">
            {c.slot}
          </text>
          <text className="chart-tick" x={xs[i]} y={PLOT.y0 + 28} textAnchor="middle">
            {shortDate(c.date)}
          </text>
        </g>
      ))}
    </svg>
  );
}
