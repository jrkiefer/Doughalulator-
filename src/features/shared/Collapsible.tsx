import { useState, type ReactNode } from 'react';

function remembered(id: string): boolean | null {
  try {
    const v = sessionStorage.getItem(`doughalulator.open.${id}`);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function remember(id: string, open: boolean) {
  try {
    sessionStorage.setItem(`doughalulator.open.${id}`, open ? '1' : '0');
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
