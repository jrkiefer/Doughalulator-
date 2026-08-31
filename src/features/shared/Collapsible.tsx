/**
 * Collapsed-by-default card sections (History, the Dough Bible, the two
 * graph drawers). Open/closed is remembered per SESSION, not per phone:
 * sessionStorage means "keep my drawer open while I work tonight" without
 * every drawer creeping open permanently over the weeks. Both accessors are
 * try/caught — storage can be unavailable (private mode) and a drawer that
 * merely forgets is fine, a drawer that crashes is not.
 */
import { useState, type ReactNode } from 'react';

/** Same naming scheme as the phone store in services/local.ts, so every key
 *  the app ever writes is recognisably ours at a glance in devtools. */
const KEY_PREFIX = 'doughalulator.v2.open.';

function remembered(id: string): boolean | null {
  try {
    const v = sessionStorage.getItem(KEY_PREFIX + id);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function remember(id: string, open: boolean) {
  try {
    sessionStorage.setItem(KEY_PREFIX + id, open ? '1' : '0');
  } catch {
    // storage full — the toggle still works for this render
  }
}

/** Collapsed-by-default card section, remembered per session. */
export function Collapsible(props: {
  id: string;
  title: ReactNode;
  note?: string;
  /** Start open on first sight — a tap in this session still wins. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => remembered(props.id) ?? props.defaultOpen ?? false);
  return (
    <section className="collapsible">
      <button
        className="bar"
        onClick={() => {
          setOpen(!open);
          remember(props.id, !open);
        }}
      >
        <span className="name">{props.title}</span>
        <span className="micro">{props.note ? `${props.note} · ` : ''}{open ? 'TAP TO COLLAPSE ▲' : 'TAP TO EXPAND ▼'}</span>
      </button>
      {open && <div className="body">{props.children}</div>}
    </section>
  );
}
