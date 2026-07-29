import { emptyCountsFields, type CountsFields } from '../shared/counts';

/** Everything the owner types on the EON page. */
export interface EonForm extends CountsFields {
  finalSales: string;
  /** Only used when there is no 2 PM record for the date. */
  manualTomorrowForecast: string;
}

export const emptyEonForm: EonForm = {
  ...emptyCountsFields,
  finalSales: '',
  manualTomorrowForecast: '',
};
