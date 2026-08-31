/**
 * The date card: which day every record on screen belongs to. The ◀ ▶ steps
 * move one day; the display itself hides a native date input on top, so
 * tapping the date opens the platform's own calendar picker. LOAD FROM SHEET
 * lives here too — the force-pull whose arming/confirming App.tsx drives.
 */
import { addDays } from '../../services/doughService';
import { SectionHead } from './SectionHead';

/** '2026-08-24' → 'Aug 24, 2026' — built by hand so it can never disagree
 *  with the record's own ISO date the way a locale-driven formatter could. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m! - 1]} ${d}, ${y}`;
}

export function ActiveDate(props: {
  date: string;
  onChange: (date: string) => void;
  onLoad: () => void;
  /** True once a first tap armed the "replace unsynced edits?" confirmation. */
  loadArmed: boolean;
  /** Outcome line under the button ("Loaded ✓", "Up to date ✓", errors…). */
  loadMsg: string;
  /**
   * True in the small hours while today's date is open: the calendar has
   * turned but the shift hasn't, so someone closing out last night is on the
   * wrong date. App.tsx decides WHEN (clock + active date); this card only
   * words the reminder, because it owns how dates read on screen.
   */
  pastMidnight?: boolean;
}) {
  return (
    <>
      <SectionHead num="00" title="Active Date" />
      <div className="card">
        <div className="date-row">
          <button
            className="date-step"
            aria-label="Previous day"
            onClick={() => props.onChange(addDays(props.date, -1))}
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
            onClick={() => props.onChange(addDays(props.date, 1))}
          >
            ▶
          </button>
        </div>
        {/* The past-midnight reminder sits between the date and the button:
            it is about WHICH date is open, so it belongs beside the date. */}
        {props.pastMidnight && (
          <div className="coming-note">
            Past midnight — still closing out last night? That's{' '}
            {formatDate(addDays(props.date, -1))}: tap ◀.
          </div>
        )}
        <button className="btn-primary" onClick={props.onLoad}>
          {props.loadArmed ? 'REPLACE UNSYNCED EDITS?' : 'LOAD FROM SHEET'}
        </button>
        {props.loadMsg && <div className="coming-note">{props.loadMsg}</div>}
      </div>
    </>
  );
}
