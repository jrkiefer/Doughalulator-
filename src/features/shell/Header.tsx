/**
 * The top band: the sync status pill, the two-tap RESET, and the title.
 *
 * The pill is the app's one honest word about where the open date's numbers
 * are — phone, sheet, in flight, or nowhere — fed by engine.status(), which
 * summarises all three record types for the date. The label set matches the
 * SyncState union one-for-one so a new state cannot ship without words.
 */
import type { SyncStatus } from '../../services/sync';

const LABELS: Record<SyncStatus['state'], string> = {
  new: 'NEW NIGHT',
  saving: 'SAVED ON PHONE',
  syncing: 'SYNCING…',
  synced: 'SYNCED ✓',
  offline: 'OFFLINE — WILL RETRY',
  rejected: 'SHEET REFUSED A SAVE',
  unsaved: 'NOT SAVED ANYWHERE',
};

export function Header(props: { status: SyncStatus; resetArmed: boolean; onReset: () => void }) {
  const { status } = props;
  // Two states carry more than their label: a refusal shows the sheet's own
  // reason (that sentence is the whole point of telling-not-retrying), and a
  // synced-but-phone-full record admits the phone half failed.
  const text =
    status.state === 'rejected' && status.reason
      ? `SHEET REFUSED: ${status.reason}`
      : status.state === 'synced' && status.phoneWriteFailed
        ? 'SYNCED — NOT ON PHONE'
        : LABELS[status.state];
  return (
    <>
      <div className="header-row">
        <span className={`status-pill status-${status.state}`} title={status.reason ?? undefined}>
          {text}
        </span>
        <button className={`btn-reset${props.resetArmed ? ' armed' : ''}`} onClick={props.onReset}>
          {props.resetArmed ? 'TAP AGAIN TO CLEAR' : 'RESET'}
        </button>
      </div>
      <h1 className="title">
        Dough <em>Tracker</em>
      </h1>
      {status.state === 'unsaved' && (
        <div className="banner-danger">
          Not saved anywhere — keep the app open and get back online.
        </div>
      )}
    </>
  );
}
