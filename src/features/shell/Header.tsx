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
