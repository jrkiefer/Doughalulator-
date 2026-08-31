import type { Bible, Bibles } from '../core/types';
import doughBibleJson from './doughBible.json';
import peachBibleJson from './peachBible.json';

/**
 * The two real bibles, typed and loaded once. The only place in the codebase
 * that reads the JSON — core never imports them, they are passed in as
 * arguments so the maths stays pure.
 */
export const regularBible = doughBibleJson;
export const peachBible = peachBibleJson as Bible;
export const bibles: Bibles = { regular: regularBible, peach: peachBible };
