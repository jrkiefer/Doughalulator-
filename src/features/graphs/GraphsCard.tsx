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
import { SectionHead } from '../shell/SectionHead';
import { LineChart, type Point } from './LineChart';

/** The x scale the owner asked for: every bible on the same run of sales. */
const X_MAX = 23000;
const X_TICKS = [0, 5000, 10000, 15000, 20000];

type Measure = BibleSizeKey | 'batches';

const MEASURES: { key: Measure; label: string; color: string }[] = [
  { key: 'indi', label: 'Indi', color: 'var(--indi)' },
  { key: 'small', label: 'Small', color: 'var(--small)' },
  { key: 'large', label: 'Large', color: 'var(--large)' },
  { key: 'sic', label: 'Sic', color: 'var(--sic)' },
  // Not a size, so it borrows the one signal colour no size uses.
  { key: 'batches', label: 'Batches', color: 'var(--warn)' },
];

const BIBLES: { key: BibleId; label: string }[] = [
  { key: 'regular', label: defaultConfig.bibleDisplayNames.regular },
  { key: 'peach', label: defaultConfig.bibleDisplayNames.peach },
];

const SIZES: BibleSizeKey[] = ['indi', 'small', 'large', 'sic'];

/**
 * One side of one measure as plottable points. A threshold the sheet has no
 * suggestion for is dropped rather than plotted as zero — and Batches needs
 * all four sizes, since a total missing a size is not a smaller total, it is
 * an unknown one.
 */
function pointsFor(rows: BibleBuildRow[], side: 'old' | 'new', measure: Measure): Point[] {
  const out: Point[] = [];
  for (const row of rows) {
    const values = row[side];
    if (measure === 'batches') {
      if (SIZES.some((size) => values[size] === null)) continue;
      out.push({ x: row.sales, y: batchesForNeeds(values as PerBibleSize, defaultConfig) });
    } else {
      const value = values[measure];
      if (value === null) continue;
      out.push({ x: row.sales, y: value });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

export function GraphsCard() {
  const [build, setBuild] = useState<BibleBuild | null>(() => cachedBibleBuild<BibleBuild>());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [bible, setBible] = useState<BibleId>('regular');
  const [measure, setMeasure] = useState<Measure>('small');

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

  return (
    <>
      <SectionHead num="05" title="Graphs" note="NEW BIBLE VS OLD" />
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
                  onClick={() => setBible(b.key)}
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
                  onClick={() => setMeasure(m.key)}
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
                <LineChart
                  title={`${chosen.label}: new bible against the old one, by sales`}
                  xMax={X_MAX}
                  xTicks={X_TICKS}
                  series={[
                    { label: 'Old', points: oldPoints, color: 'var(--ink-mute)', muted: true },
                    { label: 'New', points: newPoints, color: chosen.color },
                  ]}
                />

                <div className="chart-legend">
                  <span className="chart-key" style={{ ['--line' as string]: 'var(--ink-mute)' }}>
                    <span className="swatch" />
                    Bible now
                  </span>
                  {/* Only key a line that is actually on the chart — otherwise
                      it advertises a suggestion that isn't there. */}
                  {newPoints.length > 0 && (
                    <span className="chart-key" style={{ ['--line' as string]: chosen.color }}>
                      <span className="swatch" />
                      Suggested
                    </span>
                  )}
                  <span className="micro chart-axis-note">
                    {measure === 'batches' ? 'BATCHES' : 'BALLS'} · SALES ACROSS
                  </span>
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
    </>
  );
}
