/** Numbered section heading: badge chip + serif title, with the note on its own quiet line. */
export function SectionHead(props: { num: string; title: string; note?: string }) {
  return (
    <div className="section-head">
      <div className="row">
        <span className="badge">{props.num}</span>
        <h2>{props.title}</h2>
      </div>
      {props.note && <span className="micro note">{props.note}</span>}
    </div>
  );
}
