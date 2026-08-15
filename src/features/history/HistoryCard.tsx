import { useEffect, useState } from 'react';
import { cachedHistory } from '../../services/local';
import type { HistorySummary } from '../../services/mapping';
import { fetchHistory } from '../../services/doughService';
import { loadSettings } from '../../services/settings';
import { Collapsible } from '../shared/Collapsible';
import { fmt } from '../shared/counts';

/** How many nights the card shows — the owner asked for just the last few. */
const RECENT_NIGHTS = 3;

function line(row: HistorySummary): string {
  const sales = row.finalSales !== '' ? `$${fmt(Number(row.finalSales))}` : '—';
  const batches = row.batchesMade !== '' ? `${row.batchesMade} batches` : 'no batch tapped';
  return `${sales} · ${batches}`;
}

/** The last few nights: phone cache paints instantly, the sheet refreshes it. */
export function HistoryCard(props: { onPick: (date: string) => void }) {
  const [rows, setRows] = useState<HistorySummary[]>(cachedHistory);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    fetchHistory(loadSettings(), RECENT_NIGHTS).then((result) => {
      if (!alive) return;
      setRows(result.summaries);
      setNote(result.source === 'phone' ? 'showing the phone copy — sheet unreachable' : '');
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="band">
      <Collapsible id="history" title="History" note={`${rows.length} NIGHTS`}>
        <div className="history">
          {rows.length === 0 && <p className="days-work-note">No saved nights yet.</p>}
          {rows.map((row) => (
            <button key={row.date} className="history-row" onClick={() => props.onPick(row.date)}>
              <span className="date">{row.date}</span>
              <span className="detail">{line(row)}</span>
            </button>
          ))}
          {note && <div className="coming-note">{note}</div>}
        </div>
      </Collapsible>
    </div>
  );
}
