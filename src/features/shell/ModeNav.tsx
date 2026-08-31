/**
 * The three-tab switch. Temps rides on top as its own full-width bar — it is
 * a different job (food safety, not dough) done at different moments, so it
 * reads as a separate thing rather than a third equal tab. App.tsx holds
 * which mode is showing; each mode's feature folder owns its whole page.
 */
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
