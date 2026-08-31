import type { RoundDirection } from '../../core/types';

/**
 * A Round up / Round down pair, shared by the forecast row (Sales card) and
 * the batch row (Day's Work card).
 *
 * `active` is the direction actually IN FORCE tonight, whether the owner
 * tapped it or the rule worked it out — so the highlighted pill always matches
 * the numbers on screen. The AUTO tag says which of the two it was. Tapping the
 * pill already in force hands the night back to the rule.
 */
export function RoundingPills(props: {
  label: string;
  active: RoundDirection | null;
  isAuto: boolean;
  onPick: (direction: RoundDirection) => void;
  /** What the AUTO tag says — room for the rule itself, e.g. "AUTO · SLOW DAY = DOWN". */
  autoText?: string;
}) {
  return (
    <div className="rounding-row">
      <span className="label">{props.label}</span>
      {props.isAuto && props.active !== null && (
        <span className="auto-tag">{props.autoText ?? 'AUTO'}</span>
      )}
      {/* The pair travels as ONE box. Loose in the row they wrapped
          independently — the label's auto margin eats the free space — and
          the Day's Work row really did drop "Round down" onto a line of its
          own, where it read as an unrelated button rather than the other
          half of a choice. */}
      <span className="pills">
        <button
          className={`pill pill-sm${props.active === 'up' ? ' active' : ''}`}
          onClick={() => props.onPick('up')}
        >
          Round up
        </button>
        <button
          className={`pill pill-sm${props.active === 'down' ? ' active' : ''}`}
          onClick={() => props.onPick('down')}
        >
          Round down
        </button>
      </span>
    </div>
  );
}
