import { SectionHead } from './SectionHead';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${d}, ${y}`;
}

/** Step an ISO date by whole days (the Date constructor rolls months/years). */
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function ActiveDate(props: {
  date: string;
  onChange: (date: string) => void;
  onLoad: () => void;
  loadArmed: boolean;
  loadMsg: string;
}) {
  return (
    <>
      <SectionHead num="00" title="Active Date" />
      <div className="card">
        <div className="date-row">
          <button
            className="date-step"
            aria-label="Previous day"
            onClick={() => props.onChange(shiftDate(props.date, -1))}
          >
            ◀
          </button>
          <div className="date-display">
            <span>{formatDate(props.date)}</span>
            <span className="date-hint">📅 tap to pick any day</span>
            <input
              type="date"
              aria-label="Active date"
              value={props.date}
              onChange={(e) => e.target.value && props.onChange(e.target.value)}
            />
          </div>
          <button
            className="date-step"
            aria-label="Next day"
            onClick={() => props.onChange(shiftDate(props.date, 1))}
          >
            ▶
          </button>
        </div>
        <button className="btn-primary" onClick={props.onLoad}>
          {props.loadArmed ? 'REPLACE UNSYNCED EDITS?' : 'LOAD FROM SHEET'}
        </button>
        {props.loadMsg && <div className="coming-note">{props.loadMsg}</div>}
      </div>
    </>
  );
}
