export function Header(props: { onReset: () => void }) {
  return (
    <>
      <div className="header-row">
        <span className="status-pill">NEW NIGHT</span>
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
