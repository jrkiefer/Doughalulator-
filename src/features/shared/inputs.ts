/**
 * Numeric input hardening (§9): digits-only character filtering with caret
 * preservation. A decimal point is allowed only where meaningful (sales,
 * temps); a single leading minus only on station-temp fields.
 */
import type { ChangeEvent } from 'react';

export interface NumericOpts {
  decimal?: boolean;
  minus?: boolean;
}

export function sanitizeNumeric(raw: string, opts: NumericOpts = {}): string {
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && opts.decimal && !out.includes('.')) out += ch;
    else if (ch === '-' && opts.minus && out === '') out += ch;
  }
  return out;
}

/** Sanitize on change, keeping the caret where the user expects it. */
export function numericChangeHandler(
  opts: NumericOpts,
  onValue: (value: string) => void,
): (e: ChangeEvent<HTMLInputElement>) => void {
  return (e) => {
    const el = e.target;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const sanitized = sanitizeNumeric(raw, opts);
    onValue(sanitized);
    if (sanitized !== raw) {
      const keptBeforeCaret = sanitizeNumeric(raw.slice(0, caret), opts).length;
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(keptBeforeCaret, keptBeforeCaret);
        } catch {
          // some input types refuse selection APIs — caret lands at the end, fine
        }
      });
    }
  };
}
