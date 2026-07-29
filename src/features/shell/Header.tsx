export type AppStatus = 'new' | 'loaded' | 'saved' | 'unsynced';

const STATUS_TEXT: Record<AppStatus, string> = {
  new: 'NEW NIGHT',
  loaded: 'LOADED',
  saved: 'SAVED',
  unsynced: 'UNSYNCED',
};

export function Header(props: { status: AppStatus; onReset: () => void }) {
  return (
    <>
      <div className="header-row">
        <span className={`status-pill status-${props.status}`}>{STATUS_TEXT[props.status]}</span>
        <button className="btn-reset" onClick={props.onReset}>
          RESET
        </button>
      </div>
      <h1 className="title">
        Dough <em>Tracker</em>
      </h1>
    </>
  );
}
