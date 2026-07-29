import type { CountedInventory } from '../../core/types';

/** Everything the owner types on the 2 PM page, kept as strings so fields can be empty. */
export interface TwoPmForm {
  todayForecast: string;
  currentSales: string;
  tomorrowForecast: string;
  indiTrays: string;
  indiSingles: string;
  smallTrays: string;
  smallSingles: string;
  largeTrays: string;
  largeSingles: string;
  sicSingles: string;
  boilTrays: string;
  boilSingles: string;
}

export const emptyTwoPmForm: TwoPmForm = {
  todayForecast: '',
  currentSales: '',
  tomorrowForecast: '',
  indiTrays: '',
  indiSingles: '',
  smallTrays: '',
  smallSingles: '',
  largeTrays: '',
  largeSingles: '',
  sicSingles: '',
  boilTrays: '',
  boilSingles: '',
};

/** '' or junk → 0; otherwise the typed number. */
export function toNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseCounts(form: TwoPmForm): CountedInventory {
  return {
    indiTrays: toNum(form.indiTrays),
    indiSingles: toNum(form.indiSingles),
    smallTrays: toNum(form.smallTrays),
    smallSingles: toNum(form.smallSingles),
    largeTrays: toNum(form.largeTrays),
    largeSingles: toNum(form.largeSingles),
    sicSingles: toNum(form.sicSingles),
    boilTrays: toNum(form.boilTrays),
    boilSingles: toNum(form.boilSingles),
  };
}

/** The batch count needs current sales and both forecasts actually typed. */
export function salesComplete(form: TwoPmForm): boolean {
  return (
    form.todayForecast.trim() !== '' &&
    form.currentSales.trim() !== '' &&
    form.tomorrowForecast.trim() !== ''
  );
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
