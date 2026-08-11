# design/

Since v1.5.0 the **visual** ground truth is the owner's other app — *Dough Tracker v2, "Mise en
Place"* (`jrkiefer/jrkiefer.github.io`). Its design system was ported into our own class names, so
`src/styles.css` is now the record: the palette, the type scale and the component shapes all live
in the tokens at the top of that file. One rule that came with it and must not be broken — the page
is **one flat colour** on `html`, `body` and `.page`, with `color-scheme: light` declared. No
gradients, no dark bands.

These four screenshots stay as the record of **layout and wording** — which sections exist, in what
order, with what labels:

- `2pm-page.jpeg` — the full 2 PM page, empty state
- `eon-page.jpeg` — the full EON page, empty state
- `station-temps-page.png` — the Station Temps page
- `days-work-card.jpeg` — The Day's Work card with a chosen batch option

Their colours and fonts are superseded; do not sample from them.
