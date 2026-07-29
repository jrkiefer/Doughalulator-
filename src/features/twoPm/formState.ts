import { emptyCountsFields, type CountsFields } from '../shared/counts';

export { fmt, parseCounts, toNum } from '../shared/counts';

/** Everything the owner types on the 2 PM page. */
export interface TwoPmForm extends CountsFields {
  todayForecast: string;
  currentSales: string;
  tomorrowForecast: string;
}

export const emptyTwoPmForm: TwoPmForm = {
  ...emptyCountsFields,
  todayForecast: '',
  currentSales: '',
  tomorrowForecast: '',
};

/** The batch count needs current sales and both forecasts actually typed. */
export function salesComplete(form: TwoPmForm): boolean {
  return (
    form.todayForecast.trim() !== '' &&
    form.currentSales.trim() !== '' &&
    form.tomorrowForecast.trim() !== ''
  );
}
