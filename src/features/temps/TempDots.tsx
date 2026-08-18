/**
 * The last few readings per station: one row per station in walking order,
 * one shared °F axis, three dots a row — older readings lighter and smaller,
 * the newest full-strength with its figure printed at the row's end.
 *
 * Deliberately NOT a line chart. Eight stations as eight coloured lines is
 * unreadable spaghetti; recency is the only series here, and recency is an
 * order, so it gets one hue in lightness steps rather than eight hues.
 */
import { useRef } from 'react';
import { ticksFor } from '../graphs/chartMath';
import type { TempReading } from '../../services/tempsService';

export interface StationRow {
  station: string;
  readings: TempReading[]; // oldest first, at most a few
}

const W = 340;
const ROW_H = 25;
const TOP = 8;
const AXIS_BAND = 34;
const PLOT_X0 = 86;
const PLOT_X1 = W - 40;

/**
 * The °F scale, snapped outward to 5° so the ticks are speakable. Unlike the
 * sales axis this one goes below zero — the freezer lives there.
 */
export function tempDomain(temps: number[]): { min: number; max: number } {
  if (temps.length === 0) return { min: 0, max: 40 };
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const min = Math.floor((lo - 2) / 5) * 5;
  const max = Math.ceil((hi + 2) / 5) * 5;
  return min === max ? { min: min - 5, max: max + 5 } : { min, max };
}

function fmtTemp(value: number): string {
  const shown = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1);
  return `${value < 0 ? '−' : ''}${shown}°`;
}

export function TempDots(props: {
  rows: StationRow[];
  activeIndex: number | null;
  onActive: (index: number | null) => void;
  title: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { rows } = props;
  const H = TOP + rows.length * ROW_H + AXIS_BAND;
  const temps = rows.flatMap((r) => r.readings.map((p) => p.temp));
  const domain = tempDomain(temps);
  const sx = (t: number) =>
    PLOT_X0 + ((t - domain.min) / (domain.max - domain.min)) * (PLOT_X1 - PLOT_X0);
  const rowY = (i: number) => TOP + i * ROW_H + ROW_H / 2;
  const ticks = ticksFor(domain.min, domain.max, 5);
  const plotBottom = TOP + rows.length * ROW_H;

  function pick(clientY: number) {
    const svg = svgRef.current;
    if (!svg || rows.length === 0) return;
    const box = svg.getBoundingClientRect();
    const inSvg = ((clientY - box.top) / box.height) * H;
    const index = Math.floor((inSvg - TOP) / ROW_H);
    props.onActive(Math.min(rows.length - 1, Math.max(0, index)));
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
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        pick(e.clientY);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // no capture — a drag simply stops tracking once it leaves
        }
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) pick(e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const from = props.activeIndex ?? (step > 0 ? -1 : rows.length);
        props.onActive(Math.min(rows.length - 1, Math.max(0, from + step)));
      }}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            className={t === 0 ? 'temp-zero' : 'chart-grid'}
            x1={sx(t)}
            y1={TOP}
            x2={sx(t)}
            y2={plotBottom}
          />
          <text className="chart-tick" x={sx(t)} y={plotBottom + 13} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}

      {props.activeIndex !== null && rows[props.activeIndex] && (
        <rect
          className="temp-active-band"
          x={0}
          y={TOP + props.activeIndex * ROW_H}
          width={W}
          height={ROW_H}
          rx={4}
        />
      )}

      {rows.map((row, i) => {
        const y = rowY(i);
        const pts = row.readings;
        const latest = pts[pts.length - 1];
        return (
          <g key={row.station}>
            <text className="temp-row-label" x={2} y={y + 3}>
              {row.station}
            </text>
            {pts.length > 1 && (
              <line
                className="temp-connector"
                x1={sx(pts[0].temp)}
                y1={y}
                x2={sx(latest.temp)}
                y2={y}
              />
            )}
            {/* Older readings first so the newest paints on top where they overlap. */}
            {pts.slice(0, -1).map((p, j) => (
              <circle key={j} className="temp-dot-old" cx={sx(p.temp)} cy={y} r={3} />
            ))}
            {latest && <circle className="temp-dot-new" cx={sx(latest.temp)} cy={y} r={4.5} />}
            {latest && (
              <text className="temp-value" x={PLOT_X1 + 8} y={y + 4}>
                {fmtTemp(latest.temp)}
              </text>
            )}
          </g>
        );
      })}

      <line className="chart-axis" x1={PLOT_X0} y1={plotBottom} x2={PLOT_X1} y2={plotBottom} />
      <text className="chart-axis-title" x={(PLOT_X0 + PLOT_X1) / 2} y={H - 5} textAnchor="middle">
        °F
      </text>
    </svg>
  );
}
