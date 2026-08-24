import { emptyCountsFields, type CountsFields } from '../shared/counts';

/** Everything the owner types on the EON page. Blank ≠ zero throughout. */
export interface EonForm extends CountsFields {
  finalSales: string;
  /**
   * Tomorrow's forecast as typed HERE. Once typed it overrides the 2 PM
   * save's figure (the engine's `needSource` becomes 'manualForecast');
   * cleared, the afternoon's figure takes over again.
   */
  manualTomorrowForecast: string;
}

export const emptyEonForm: EonForm = {
  ...emptyCountsFields,
  finalSales: '',
  manualTomorrowForecast: '',
};
