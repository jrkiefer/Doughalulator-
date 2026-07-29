import { SectionHead } from './SectionHead';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${d}, ${y}`;
}

export function ActiveDate(props: { date: string; onChange: (date: string) => void }) {
  return (
    <>
      <SectionHead num="00" title="Active Date" />
      <div className="card">
        <div className="date-display">
          {formatDate(props.date)}
          <input
            type="date"
            aria-label="Active date"
            value={props.date}
            onChange={(e) => e.target.value && props.onChange(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled>
          LOAD FROM SHEET
        </button>
        <div className="coming-note">coming in a later step</div>
      </div>
    </>
  );
}
