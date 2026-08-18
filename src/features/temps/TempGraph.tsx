import { useState } from 'react';
import { defaultConfig } from '../../config';
import {
  fetchRecentTemps,
  type RecentTemps,
} from '../../services/tempsService';
import { cacheTempGraph, cachedTempGraph } from '../../services/local';
import { Collapsible } from '../shared/Collapsible';
import { TempDots, type StationRow } from './TempDots';

/** '2026-08-16' → '8/16' — enough date to place a reading, no more. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function fmtTemp(value: number): string {
  const shown = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1);
  return `${value < 0 ? '−' : ''}${shown}°`;
}

export function TempGraph() {
  const [stations, setStations] = useState<RecentTemps | null>(() => cachedTempGraph<RecentTemps>());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
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

  // Walking order, exactly as the inputs above — never the response's order.
  const rows: StationRow[] = defaultConfig.stations
    .map((station) => ({ station, readings: stations?.[station] ?? [] }))
    .filter((row) => row.readings.length > 0);

  const reading = active === null ? null : (rows[active] ?? null);

  return (
    <Collapsible id="tempgraph" title="Temp graph" note={stations ? 'LOADED' : 'OFF'}>
      <div className="graph-controls">
        <button className="btn-primary" onClick={() => void load()} disabled={busy}>
          {busy ? 'LOADING…' : stations ? 'RELOAD' : 'LOAD GRAPH'}
        </button>
      </div>

      {note && <div className="coming-note">{note}</div>}

      {stations && rows.length === 0 && (
        <p className="days-work-note">No temperatures recorded yet — this fills in as readings are taken.</p>
      )}

      {rows.length > 0 && (
        <>
          <div className={`chart-readout${reading ? '' : ' idle'}`}>
            {reading ? (
              <>
                <span className="at">{reading.station}</span>
                {reading.readings.map((r, i) => (
                  <span className="pair" key={i}>
                    {i > 0 && '→ '}
                    <strong>{fmtTemp(r.temp)}</strong> {r.slot} {shortDate(r.date)}
                  </span>
                ))}
              </>
            ) : (
              'Tap a station to read its last three.'
            )}
          </div>

          <TempDots
            title="Each station's last few temperatures, oldest to newest, in degrees Fahrenheit"
            rows={rows}
            activeIndex={active}
            onActive={setActive}
          />

          <div className="chart-legend">
            <span className="chart-key temp-key-old">
              <span className="swatch dot" />
              Earlier
            </span>
            <span className="chart-key temp-key-new">
              <span className="swatch dot" />
              Newest
            </span>
          </div>
        </>
      )}
    </Collapsible>
  );
}
