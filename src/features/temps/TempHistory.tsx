import { useEffect, useState } from 'react';
import { defaultConfig } from '../../config';
import { cachedTempGraph, cacheTempGraph } from '../../services/local';
import { fetchRecentTemps, type RecentTemps } from '../../services/tempsService';
import { Collapsible } from '../shared/Collapsible';
import { fmtTemp, normalizeSlot } from './tempChart';

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * The temps tab's History: each station's LAST reading, one line each (owner's
 * ask, Aug 2026 — the last-three version wrapped and read as clutter). Same
 * data and phone cache as the graph. Phone copy paints instantly; the sheet
 * refreshes it.
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
  // One line per station: its last known temp, and when it was taken.
  const rows = defaultConfig.stations
    .map((station) => {
      const readings = stations?.[station] ?? [];
      return { station, last: readings[readings.length - 1] };
    })
    .filter((row) => row.last !== undefined);

  return (
    <div className="band">
      <Collapsible id="temphistory" title="History" note={`${rows.length} STATIONS`}>
        <div className="temp-history">
          {rows.length === 0 && (
            <p className="days-work-note">No temperatures recorded yet — this fills in as readings are taken.</p>
          )}
          {rows.map(({ station, last }) => (
            <div className="temp-history-row" key={station}>
              <span className="station">{station}</span>
              <span className="readings">
                <strong>{fmtTemp(last!.temp)}</strong> {normalizeSlot(last!.slot)}{' '}
                {shortDate(last!.date)}
              </span>
            </div>
          ))}
          {note && <div className="coming-note">{note}</div>}
        </div>
      </Collapsible>
    </div>
  );
}
