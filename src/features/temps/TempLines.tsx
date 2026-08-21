/**
 * The temp line graph: time across the bottom (the last few reading moments,
 * slot over date), °F up the side on a FIXED 28–50 scale split at 40 into a
 * fridge-safe band and a danger band. One line per chosen station, straight
 * segments — three points is a record, not a curve.
 *
 * A reading above 50 does not stretch the scale: it becomes an accent arrow
 * out the top, and the red warning box BESIDE the chart carries the station
 * and figure (owner's ask, Aug 2026 — text inside the plot got crossed by
 * lines). Below 28 — which nothing should ever read; the freezer runs ~32 —
 * mirrors it quietly out the bottom with its figure.
 *
 * Deliberately not tappable: the crosshair readout was removed at the same
 * ask. The History card above carries the numbers.
 */
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

export function TempLines(props: { columns: TimeColumn[]; series: TempSeries[]; title: string }) {
  const { columns, series } = props;
  const n = columns.length;

  const colX = (i: number) =>
    n === 1
      ? (PLOT.x0 + PLOT.x1) / 2
      : PLOT.x0 + COL_INSET + (i * (PLOT.x1 - PLOT.x0 - 2 * COL_INSET)) / (n - 1);
  const sy = (t: number) =>
    PLOT.y0 - ((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * (PLOT.y0 - PLOT.y1);
  /** Where a point draws: out-of-range readings sit on the edge, arrowed. */
  const py = (t: number) => sy(Math.min(SCALE_MAX, Math.max(SCALE_MIN, t)));

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={props.title}
      preserveAspectRatio="xMidYMid meet"
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
                // Out the top (or bottom): an arrow at the edge. Over the top
                // the red box beside the chart carries station and figure;
                // under the bottom the small figure here is its only home.
                const over = t > SCALE_MAX;
                const edge = over ? PLOT.y1 : PLOT.y0;
                const tip = over ? edge - 9 : edge + 9;
                return (
                  <g key={i}>
                    <path
                      className={`temp-arrow${over ? ' over' : ''}`}
                      d={`M ${x} ${tip} L ${x - 4.5} ${edge} L ${x + 4.5} ${edge} Z`}
                    />
                    {!over && (
                      <text
                        className="temp-arrow-value"
                        x={x + 8}
                        y={edge + 7}
                        textAnchor="start"
                      >
                        {fmtTemp(t)}
                      </text>
                    )}
                  </g>
                );
              }
              return <circle key={i} className="temp-dot" cx={x} cy={py(t)} r={3} />;
            })}
          </g>
        );
      })}

      <line className="chart-axis" x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x1} y2={PLOT.y0} />

      {columns.map((c, i) => (
        <g key={`${c.date}|${c.slot}`}>
          <text className="temp-x-slot" x={colX(i)} y={PLOT.y0 + 15} textAnchor="middle">
            {c.slot}
          </text>
          <text className="chart-tick" x={colX(i)} y={PLOT.y0 + 28} textAnchor="middle">
            {shortDate(c.date)}
          </text>
        </g>
      ))}
    </svg>
  );
}
