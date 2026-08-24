/**
 * The Bible-comparison drawer: the bible in use laid over what the recorded
 * nights suggest (the self-building bible the Dough Log fits after every EON
 * save). Loads NOTHING until the button is tapped, then caches the answer on
 * the phone so it reopens instantly and still draws with no signal.
 *
 * Deliberately one chart + pills + the tap readout, nothing more (owner's
 * choice, Aug 2026): a Gap view, a Table view and a summary sentence were
 * built, shipped and removed. Don't re-add views here without being asked.
 */
import { useState } from 'react';
import { defaultConfig, type BibleId } from '../../config';
import { batchesForNeeds } from '../../core';
import type { BibleSizeKey, PerBibleSize } from '../../core/types';
import {
  fetchBibleBuild,
  type BibleBuild,
  type BibleBuildRow,
} from '../../services/doughService';
import { cacheBibleBuild, cachedBibleBuild } from '../../services/local';
import { Collapsible } from '../shared/Collapsible';
import { fmt } from '../shared/counts';
import { LineChart, type Point } from './LineChart';

type Measure = BibleSizeKey | 'batches';

const MEASURES: { key: Measure; label: string; color: string; unit: string }[] = [
  { key: 'indi', label: 'Indi', color: 'var(--indi)', unit: 'BALLS' },
  { key: 'small', label: 'Small', color: 'var(--small)', unit: 'BALLS' },
  { key: 'large', label: 'Large', color: 'var(--large)', unit: 'BALLS' },
  { key: 'sic', label: 'Sic', color: 'var(--sic)', unit: 'BALLS' },
  // Not a size, so it borrows the one signal colour no size uses.
  { key: 'batches', label: 'Batches', color: 'var(--warn)', unit: 'BATCHES' },
];

const BIBLES: { key: BibleId; label: string }[] = [
  { key: 'regular', label: defaultConfig.bibleDisplayNames.regular },
  { key: 'peach', label: defaultConfig.bibleDisplayNames.peach },
];

const SIZES: BibleSizeKey[] = ['indi', 'small', 'large', 'sic'];

/**
 * One side of one measure. A threshold the sheet has no suggestion for is left
 * out rather than plotted as zero — and Batches needs all four sizes, since a
 * total missing a size is not a smaller total, it is an unknown one.
 */
function valueAt(row: BibleBuildRow, side: 'old' | 'new', measure: Measure): number | null {
  const values = row[side];
  if (measure !== 'batches') return values[measure];
  if (SIZES.some((size) => values[size] === null)) return null;
  return batchesForNeeds(values as PerBibleSize, defaultConfig);
}

function pointsFor(rows: BibleBuildRow[], side: 'old' | 'new', measure: Measure): Point[] {
  return rows
    .map((row) => ({ x: row.sales, y: valueAt(row, side, measure) }))
    .filter((p): p is Point => p.y !== null)
    .sort((a, b) => a.x - b.x);
}

function showValue(value: number | null): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? fmt(value) : value.toFixed(2);
}

export function GraphsCard() {
  const [build, setBuild] = useState<BibleBuild | null>(() => cachedBibleBuild<BibleBuild>());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [bible, setBible] = useState<BibleId>('regular');
  const [measure, setMeasure] = useState<Measure>('small');
  const [active, setActive] = useState<number | null>(null);

  // Switching what's plotted moves the thresholds out from under the crosshair,
  // so the reading it was showing no longer describes anything. Cleared at the
  // tap that causes it, rather than after the fact in an effect.
  function pickBible(id: BibleId) {
    setBible(id);
    setActive(null);
  }

  function pickMeasure(key: Measure) {
    setMeasure(key);
    setActive(null);
  }

  async function load() {
    setBusy(true);
    setNote('');
    const result = await fetchBibleBuild();
    setBusy(false);
    if (result.kind === 'unreachable') return setNote("Can't reach the spreadsheet — check your connection.");
    if (result.kind === 'rejected') {
      // Overwhelmingly this is a Dough Log whose script predates the graph.
      return setNote(
        `The spreadsheet can't answer this yet — it needs its one-off update. (${result.reason})`,
      );
    }
    setBuild(result.build);
    cacheBibleBuild(result.build);
  }

  const rows = build?.[bible] ?? [];
  const chosen = MEASURES.find((m) => m.key === measure)!;
  const oldPoints = pointsFor(rows, 'old', measure);
  const newPoints = pointsFor(rows, 'new', measure);
  const allX = [...new Set([...oldPoints, ...newPoints].map((p) => p.x))].sort((a, b) => a - b);

  const reading =
    active === null || allX[active] === undefined
      ? null
      : (() => {
          const sales = allX[active];
          const now = oldPoints.find((p) => p.x === sales)?.y ?? null;
          const next = newPoints.find((p) => p.x === sales)?.y ?? null;
          const gap = now !== null && next !== null ? Number((next - now).toFixed(2)) : null;
          // Three balls off seven is a different story from three off three
          // hundred, and the percentage is the only place that shows.
          const pct = gap !== null && now ? Math.round((gap / now) * 100) : null;
          return { sales, now, next, gap, pct };
        })();

  return (
    <Collapsible id="graphs" title="Bible comparison" note={build ? 'LOADED' : 'OFF'}>
      <div className="graph-controls">
        <button className="btn-primary" onClick={() => void load()} disabled={busy}>
          {busy ? 'LOADING…' : build ? 'RELOAD' : 'LOAD GRAPH'}
        </button>
      </div>

      {note && <div className="coming-note">{note}</div>}

      {build && (
        <>
          <div className="rounding-row">
            <span className="label">BIBLE</span>
            {BIBLES.map((b) => (
              <button
                key={b.key}
                className={`pill pill-sm${bible === b.key ? ' active' : ''}`}
                onClick={() => pickBible(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="rounding-row">
            <span className="label">SHOWING</span>
            {MEASURES.map((m) => (
              <button
                key={m.key}
                className={`pill pill-sm${measure === m.key ? ' active' : ''}`}
                onClick={() => pickMeasure(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="days-work-note">
              Nothing recorded on this bible yet — its page in the Dough Log is still empty.
            </p>
          ) : (
            <>
              {/* The readout keeps its height whether or not anything is
                  picked, so tapping the chart never shunts it up the page. */}
              <div className={`chart-readout${reading ? '' : ' idle'}`}>
                {reading ? (
                  <>
                    <span className="at">${fmt(reading.sales)}</span>
                    <span className="pair">
                      <span className="key" style={{ ['--line' as string]: 'var(--ink)' }} />
                      now <strong>{showValue(reading.now)}</strong>
                    </span>
                    <span className="pair">
                      <span className="key" style={{ ['--line' as string]: chosen.color }} />
                      new <strong>{showValue(reading.next)}</strong>
                    </span>
                    {reading.gap !== null && (
                      <span className={`gap ${reading.gap > 0 ? 'up' : reading.gap < 0 ? 'down' : ''}`}>
                        {reading.gap === 0
                          ? 'same'
                          : `${reading.gap > 0 ? '+' : '−'}${Math.abs(reading.gap)}` +
                            (reading.pct === null ? '' : ` (${reading.pct > 0 ? '+' : '−'}${Math.abs(reading.pct)}%)`)}
                      </span>
                    )}
                  </>
                ) : (
                  'Tap the graph to read a sales figure.'
                )}
              </div>

              <LineChart
                title={`${chosen.label}: the suggested bible against the one in use, by sales`}
                unit={chosen.unit}
                activeIndex={active}
                onActive={setActive}
                series={[
                  { label: 'Bible now', points: oldPoints, color: 'var(--ink)', reference: true },
                  { label: 'Suggested', points: newPoints, color: chosen.color },
                ]}
              />

              <div className="chart-legend">
                <span className="chart-key" style={{ ['--line' as string]: 'var(--ink)' }}>
                  <span className="swatch dashed" />
                  Bible now
                </span>
                {/* Only key a line that is actually on the chart. */}
                {newPoints.length > 0 && (
                  <span className="chart-key" style={{ ['--line' as string]: chosen.color }}>
                    <span className="swatch" />
                    Suggested
                  </span>
                )}
              </div>

              {newPoints.length === 0 && (
                <p className="days-work-note">
                  No suggestion on this bible yet — it needs three finished nights before it
                  starts working one out.
                </p>
              )}

              {measure === 'batches' && (
                <p className="days-work-note">
                  Batches here is the whole night from nothing: every size&rsquo;s balls divided by
                  its tray, added up, divided by {defaultConfig.traysPerBatch}. Not the same as a
                  night&rsquo;s batch count, which takes off what you already have.
                </p>
              )}
            </>
          )}
        </>
      )}
    </Collapsible>
  );
}
