import { emptyCountsFields, type CountsFields } from '../shared/counts';

/** Everything the owner types on the 2 PM page. Blank ≠ zero throughout. */
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
