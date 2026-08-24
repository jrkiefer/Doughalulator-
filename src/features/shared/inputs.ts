/**
 * Numeric input hardening: digits-only character filtering with caret
 * preservation, for every field that goes through the sanitized-text path
 * (sales, dough counts). A decimal point is allowed only where meaningful
 * (sales — "9.5" means $9,500). Station temperatures do NOT come through
 * here: they use a native `type="number"` input so the phone keyboard offers
 * a minus key for the freezer, and the backend validates the number.
 *
 * Why filter at all: `inputMode` only picks the keyboard — a phone can still
 * paste "12abc" or an iOS text replacement into the field. Filtering on
 * change keeps the FORM state clean (blank-≠-zero relies on the string being
 * either empty or a number), and the caret math keeps typing feel native:
 * without it, React re-rendering a corrected value throws the caret to the
 * end of the field.
 */
import type { ChangeEvent } from 'react';

export interface NumericOpts {
  /** Allow one decimal point (sales fields). Counts are whole numbers. */
  decimal?: boolean;
}

/** Keep only what a number can contain, preserving first-decimal-wins. */
function sanitizeNumeric(raw: string, opts: NumericOpts = {}): string {
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && opts.decimal && !out.includes('.')) out += ch;
  }
  return out;
}

/**
 * Sanitize on change, keeping the caret where the user expects it: the new
 * caret position is "how many kept characters sat before the old caret",
 * applied on the next frame because React must paint the corrected value
 * before the selection can be set on it.
 */
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
