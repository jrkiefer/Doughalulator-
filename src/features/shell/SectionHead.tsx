/** Numbered section heading: step number, serif title, and the note quiet on the right. */
export function SectionHead(props: { num: string; title: string; note?: string }) {
  return (
    <div className="section-head">
      <span className="badge">{props.num}</span>
      <h2>{props.title}</h2>
      {props.note && <span className="micro note">{props.note}</span>}
    </div>
  );
}
