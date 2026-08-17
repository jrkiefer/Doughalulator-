/**
 * The gap on its own, against a zero line.
 *
 * The two-line view answers "what do the bibles look like"; this answers the
 * question actually being asked — "how far apart are they, and where". Reading
 * a height off a baseline is a far easier job than eyeballing the distance
 * between two near-parallel curves, which is what the reader was being asked
 * to do before.
 *
 * Colour here carries POLARITY, not identity, so it is a diverging pair: warm
 * above the line, cool below, with the neutral at zero. Red/green — the obvious
 * more/less pair — measures ΔE 7.2 under colour blindness, below the floor of
 * 8, so it is exactly the trap it looks like. Red against blue scores 21.2.
 */
import { useId, useRef } from 'react';
import { nearestIndex, smoothPath, snugDomain, tickStep, ticksFor, type Point } from './chartMath';

const W = 340;
const H = 218;
const PAD = { left: 34, right: 40, top: 22, bottom: 36 };
const PLOT = { x0: PAD.left, x1: W - PAD.right, y0: H - PAD.bottom, y1: PAD.top };

function fmtValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}

const fmtSales = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));

export function DiffChart(props: {
  /** x = sales, y = suggested − now. */
  points: Point[];
  activeIndex: number | null;
  onActive: (index: number | null) => void;
  unit: string;
  title: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const pts = [...props.points].sort((a, b) => a.x - b.x);
  if (pts.length === 0) return null;

  const xs = pts.map((p) => p.x);
  const domain = snugDomain(xs);
  // The scale always contains zero — a difference chart whose baseline is off
  // the canvas is telling a different story than the one it claims to.
  //
  // ONE step spans the whole scale rather than a step per half. Sizing the two
  // sides separately gave 10 / 5 / 0 / −25 / −50: the gaps changed at the
  // baseline, so equal distances up and down the axis meant different amounts.
  const rawTop = Math.max(0, ...pts.map((p) => p.y));
  const rawBottom = Math.min(0, ...pts.map((p) => p.y));
  const whole = pts.every((p) => Number.isInteger(p.y));
  const step = Math.max(whole ? 1 : 0, tickStep(rawTop - rawBottom || 1, 6));
  const top = Math.ceil(rawTop / step) * step;
  const bottom = Math.floor(rawBottom / step) * step;
  const span = top - bottom || 1;

  const sx = (x: number) =>
    PLOT.x0 + ((x - domain.min) / (domain.max - domain.min)) * (PLOT.x1 - PLOT.x0);
  const sy = (y: number) => PLOT.y0 - ((y - bottom) / span) * (PLOT.y0 - PLOT.y1);
  const zero = sy(0);

  const placed = pts.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const curve = smoothPath(placed);
  // Closed back along the zero line, then clipped twice — once above, once
  // below — so each half takes its own side's colour with no seam.
  const area = `${curve} L ${placed[placed.length - 1].x} ${zero} L ${placed[0].x} ${zero} Z`;

  const yTicks: number[] = [];
  for (let t = bottom; t <= top + step * 0.001; t += step) {
    yTicks.push(Number(t.toPrecision(12)));
  }
  const xTicks = ticksFor(domain.min, domain.max, 4);
  const activeX = props.activeIndex === null ? null : xs[props.activeIndex];

  function pick(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const inSvg = ((clientX - box.left) / box.width) * W;
    const value = domain.min + ((inSvg - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * (domain.max - domain.min);
    props.onActive(nearestIndex(xs, value));
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
        pick(e.clientX);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // no capture — a drag simply stops tracking once it leaves
        }
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) pick(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const from = props.activeIndex ?? (step > 0 ? -1 : xs.length);
        props.onActive(Math.min(xs.length - 1, Math.max(0, from + step)));
      }}
    >
      <defs>
        <clipPath id={`${clipId}-up`}>
          <rect x={0} y={PLOT.y1 - 2} width={W} height={Math.max(0, zero - PLOT.y1 + 2)} />
        </clipPath>
        <clipPath id={`${clipId}-down`}>
          <rect x={0} y={zero} width={W} height={Math.max(0, PLOT.y0 - zero + 2)} />
        </clipPath>
      </defs>

      <text className="chart-axis-title" x={2} y={12}>
        {props.unit} vs bible
      </text>

      {yTicks.map((t) => (
        <g key={t}>
          <line className="chart-grid" x1={PLOT.x0} y1={sy(t)} x2={PLOT.x1} y2={sy(t)} />
          <text className="chart-tick" x={PLOT.x0 - 5} y={sy(t) + 3} textAnchor="end">
            {fmtValue(t)}
          </text>
        </g>
      ))}

      <path className="diff-fill up" d={area} clipPath={`url(#${clipId}-up)`} />
      <path className="diff-fill down" d={area} clipPath={`url(#${clipId}-down)`} />
      <path className="diff-line" d={curve} fill="none" />

      {/* Zero is the whole reference — it outranks the other gridlines. */}
      <line className="diff-zero" x1={PLOT.x0} y1={zero} x2={PLOT.x1} y2={zero} />

      {activeX !== null && (
        <>
          <line className="chart-crosshair" x1={sx(activeX)} y1={PLOT.y1} x2={sx(activeX)} y2={PLOT.y0} />
          <circle
            className={`diff-dot ${pts[props.activeIndex!].y >= 0 ? 'up' : 'down'}`}
            cx={sx(activeX)}
            cy={sy(pts[props.activeIndex!].y)}
            r={4.5}
          />
        </>
      )}

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
