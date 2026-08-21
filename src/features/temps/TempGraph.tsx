import { useState } from 'react';
import { defaultConfig } from '../../config';
import {
  fetchRecentTemps,
  type RecentTemps,
} from '../../services/tempsService';
import {
  cacheTempGraph,
  cachedTempGraph,
  cacheTempPicks,
  cachedTempPicks,
} from '../../services/local';
import { Collapsible } from '../shared/Collapsible';
import { fmtTemp, stationSeries, timeColumns } from './tempChart';
import { TempLines, type TempSeries } from './TempLines';

/**
 * Line colours by PICK ORDER, not by station: eight permanently-distinct hues
 * do not exist on this paper — every teal collides with the Large blue — but
 * four measured ones do (worst pair ΔE 18.8 colour-blind / 19.6 ordinary,
 * validated Aug 2026). The pills wear the colour, so the mapping is always on
 * screen. Red is last so a line only wears the danger colour when four are up.
 */
const LINE_COLORS = ['var(--large)', 'var(--boli)', 'var(--warn)', 'var(--small)'];

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function TempGraph() {
  const [stations, setStations] = useState<RecentTemps | null>(() => cachedTempGraph<RecentTemps>());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // First ever open shows one station; after that, whatever was chosen last.
  const [picks, setPicks] = useState<string[]>(() => cachedTempPicks() ?? ['Pizza 1']);
  const [active, setActive] = useState<number | null>(null);

  async function load() {
    setBusy(true);
    setNote('');
    const result = await fetchRecentTemps();
    setBusy(false);
    if (result.kind === 'unreachable') return setNote("Can't reach the spreadsheet — check your connection.");
    if (result.kind === 'rejected') {
      // Overwhelmingly this is a Temp Log whose script predates the graph.
      return setNote(
        `The Temp Log can't answer this yet — it needs its one-off update. (${result.reason})`,
      );
    }
    setStations(result.stations);
    cacheTempGraph(result.stations);
  }

  function toggle(station: string) {
    const next = picks.includes(station)
      ? picks.filter((s) => s !== station)
      : [...picks, station];
    setPicks(next);
    cacheTempPicks(next);
  }

  const columns = stations ? timeColumns(stations) : [];
  const series: TempSeries[] = picks.map((station, i) => ({
    station,
    color: LINE_COLORS[i % LINE_COLORS.length],
    temps: stationSeries(stations?.[station] ?? [], columns),
  }));
  const drawn = series.filter((s) => s.temps.some((t) => t !== null));

  const column = active === null ? null : (columns[active] ?? null);

  return (
    <Collapsible id="tempgraph" title="Temp graph" note={stations ? 'LOADED' : 'OFF'}>
      <div className="graph-controls">
        <button className="btn-primary" onClick={() => void load()} disabled={busy}>
          {busy ? 'LOADING…' : stations ? 'RELOAD' : 'LOAD GRAPH'}
        </button>
      </div>

      {note && <div className="coming-note">{note}</div>}

      {stations && columns.length === 0 && (
        <p className="days-work-note">No temperatures recorded yet — this fills in as readings are taken.</p>
      )}

      {columns.length > 0 && (
        <>
          {/* Walking order, exactly as the inputs above — never pick order. */}
          <div className="station-row">
            {defaultConfig.stations.map((station) => {
              const at = picks.indexOf(station);
              return (
                <button
                  key={station}
                  className={`pill pill-sm${at >= 0 ? ' active' : ''}`}
                  onClick={() => toggle(station)}
                >
                  {at >= 0 && (
                    <span
                      className="dot"
                      style={{ ['--line' as string]: LINE_COLORS[at % LINE_COLORS.length] }}
                    />
                  )}
                  {station}
                </button>
              );
            })}
          </div>

          {drawn.length === 0 ? (
            <p className="days-work-note">
              {picks.length === 0
                ? 'Tap a station above to draw its line.'
                : 'Nothing recorded for the chosen stations yet.'}
            </p>
          ) : (
            <>
              {/* The readout keeps its height whether or not anything is
                  picked, so tapping the chart never shunts it up the page. */}
              <div className={`chart-readout${column ? '' : ' idle'}`}>
                {column ? (
                  <>
                    <span className="at">
                      {column.slot} {shortDate(column.date)}
                    </span>
                    {drawn.map((s) => {
                      const temp = active === null ? null : s.temps[active];
                      return temp === null ? null : (
                        <span className="pair" key={s.station}>
                          <span className="key" style={{ ['--line' as string]: s.color }} />
                          {s.station} <strong>{fmtTemp(temp)}</strong>
                        </span>
                      );
                    })}
                  </>
                ) : (
                  'Tap the graph to read a time.'
                )}
              </div>

              <TempLines
                title="Chosen stations' recent temperatures over the last reading times, in degrees Fahrenheit"
                columns={columns}
                series={drawn}
                activeIndex={active}
                onActive={setActive}
              />
            </>
          )}
        </>
      )}
    </Collapsible>
  );
}
