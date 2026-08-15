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
}) {
  return (
    <div className="rounding-row">
      <span className="label">{props.label}</span>
      {props.isAuto && props.active !== null && <span className="auto-tag">AUTO</span>}
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
    </div>
  );
}
