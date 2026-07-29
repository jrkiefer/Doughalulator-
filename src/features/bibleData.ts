import type { Bible, Bibles } from '../core/types';
import doughBibleJson from '../data/doughBible.json';
import peachBibleJson from '../data/peachBible.json';

/** The real bibles, loaded once for the UI. Core never imports these — they're passed in. */
export const bibles: Bibles = {
  regular: doughBibleJson as Bible,
  peach: peachBibleJson as Bible,
};
