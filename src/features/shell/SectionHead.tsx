/** Numbered section heading: badge chip, serif title, right-aligned micro note. */
export function SectionHead(props: { num: string; title: string; note?: string }) {
  return (
    <div className="section-head">
      <span className="badge">{props.num}</span>
      <h2>{props.title}</h2>
      {props.note && <span className="micro">{props.note}</span>}
    </div>
  );
}
