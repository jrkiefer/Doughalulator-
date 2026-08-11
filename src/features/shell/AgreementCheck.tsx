import type { Agreement } from '../../services/agreement';
import { fmt } from '../shared/counts';

/**
 * The bottom-of-screen answer to "can I trust these numbers?" — the app's own
 * maths against what the sheet's formulas worked out from the same counts.
 * Any line that disagrees is named with both numbers, so a mismatch is
 * actionable rather than just alarming.
 */
export function AgreementCheck(props: { agreement: Agreement; note: string }) {
  const { agreement } = props;

  if (agreement.state === 'unchecked') {
    return (
      <div className="agreement agreement-unchecked">
        <span className="agreement-mark">·</span>
        {props.note || 'Nothing to cross-check yet'}
      </div>
    );
  }

  if (agreement.state === 'agree') {
    return (
      <div className="agreement agreement-ok">
        <span className="agreement-mark">✓</span>
        APP AND SHEET AGREE
        <span className="agreement-count">
          {agreement.checked} number{agreement.checked === 1 ? '' : 's'} checked
        </span>
      </div>
    );
  }

  return (
    <div className="agreement agreement-differ">
      <div className="agreement-head">
        <span className="agreement-mark">!</span>
        {agreement.problems.length} NUMBER{agreement.problems.length === 1 ? '' : 'S'} DON&apos;T MATCH
      </div>
      <ul className="agreement-list">
        {agreement.problems.map((line) => (
          <li key={line.label}>
            <span>{line.label}</span>
            <span className="agreement-values">
              app {fmt(line.app)} · sheet {fmt(line.sheet)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
