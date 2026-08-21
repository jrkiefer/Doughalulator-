import { useEffect, useState } from 'react';
import { defaultConfig } from '../../config';
import { cachedTempGraph, cacheTempGraph } from '../../services/local';
import { fetchRecentTemps, type RecentTemps, type TempReading } from '../../services/tempsService';
import { Collapsible } from '../shared/Collapsible';
import { fmtTemp, normalizeSlot } from './tempChart';

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * The temps tab's History: each station's last three readings, straight off
 * the Log — the same data (and the same phone cache) the graph draws, worded
 * instead of plotted. Phone copy paints instantly; the sheet refreshes it.
 */
export function TempHistory() {
  const [stations, setStations] = useState<RecentTemps | null>(() => cachedTempGraph<RecentTemps>());
  const [note, setNote] = useState('');

  // One refresh at mount, like the dough History card.
  useEffect(() => {
    let alive = true;
    fetchRecentTemps().then((result) => {
      if (!alive) return;
      if (result.kind === 'unreachable') {
        setNote('showing the phone copy — sheet unreachable');
        return;
      }
      if (result.kind === 'rejected') {
        setNote('The Temp Log needs its one-off update before this can load.');
        return;
      }
      setStations(result.stations);
      cacheTempGraph(result.stations);
      setNote('');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Walking order, exactly as the inputs above — never the response's order.
  const rows = defaultConfig.stations
    .map((station) => ({ station, readings: stations?.[station] ?? [] }))
    .filter((row) => row.readings.length > 0);

  const reading = (r: TempReading, last: boolean) => (
    <span className="pair" key={`${r.date}|${r.slot}`}>
      {last ? <strong>{fmtTemp(r.temp)}</strong> : fmtTemp(r.temp)} {normalizeSlot(r.slot)}{' '}
      {shortDate(r.date)}
    </span>
  );

  return (
    <div className="band">
      <Collapsible id="temphistory" title="History" note={`${rows.length} STATIONS`}>
        <div className="temp-history">
          {rows.length === 0 && (
            <p className="days-work-note">No temperatures recorded yet — this fills in as readings are taken.</p>
          )}
          {rows.map((row) => (
            <div className="temp-history-row" key={row.station}>
              <span className="station">{row.station}</span>
              <span className="readings">
                {row.readings.map((r, i) => reading(r, i === row.readings.length - 1))}
              </span>
            </div>
          ))}
          {note && <div className="coming-note">{note}</div>}
        </div>
      </Collapsible>
    </div>
  );
}
