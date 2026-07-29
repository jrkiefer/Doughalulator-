export type Mode = '2pm' | 'eon' | 'temps';

export function ModeNav(props: { mode: Mode; onChange: (mode: Mode) => void }) {
  const { mode, onChange } = props;
  return (
    <nav className="mode-nav">
      <button
        className={`temps-bar${mode === 'temps' ? ' active' : ''}`}
        onClick={() => onChange('temps')}
      >
        STATION TEMPS
      </button>
      <div className="tabs">
        <button className={mode === '2pm' ? 'active' : ''} onClick={() => onChange('2pm')}>
          2 PM
        </button>
        <button className={mode === 'eon' ? 'active' : ''} onClick={() => onChange('eon')}>
          EON
        </button>
      </div>
    </nav>
  );
}
