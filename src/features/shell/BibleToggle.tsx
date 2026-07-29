import type { BibleId } from '../../config';
import { defaultConfig } from '../../config';

/** "DOUGH BIBLE / AUTO" row. Auto-picked by date; tapping a pill overrides for this record. */
export function BibleToggle(props: {
  active: BibleId;
  isAuto: boolean;
  onOverride: (id: BibleId) => void;
}) {
  const names = defaultConfig.bibleDisplayNames;
  return (
    <div className="bible-row">
      <div className="labels">
        <span className="label">DOUGH BIBLE</span>
        {props.isAuto && <span className="auto-tag">AUTO</span>}
      </div>
      {(['regular', 'peach'] as const).map((id) => (
        <button
          key={id}
          className={`pill pill-sm${props.active === id ? ' active' : ''}`}
          onClick={() => props.onOverride(id)}
        >
          {names[id]}
        </button>
      ))}
    </div>
  );
}
