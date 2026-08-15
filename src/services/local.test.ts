import { describe, expect, it } from 'vitest';
import { datesToPrune, type DateEntry } from './local';

/** A record the sheet has confirmed. */
function confirmed(): DateEntry['day'] {
  return { form: { todayForecast: '9' }, rounding: null, bibleOverride: null,
    updatedAt: 100, syncedAt: 100, ackHash: 'abc', rejectedReason: null };
}

/** A record typed but never acknowledged by the sheet. */
function unsent(): DateEntry['day'] {
  return { form: { todayForecast: '9' }, rounding: null, bibleOverride: null,
    updatedAt: 200, syncedAt: 100, ackHash: null, rejectedReason: null };
}

const CUTOFF = '2026-05-17';

describe('datesToPrune (forgetting long-finished dates)', () => {
  it('drops an old date the sheet has confirmed', () => {
    const entries = [{ date: '2026-01-04', entry: { day: confirmed() } }];
    expect(datesToPrune(entries, CUTOFF)).toEqual(['2026-01-04']);
  });

  it('keeps a recent date, however finished it is', () => {
    const entries = [{ date: '2026-08-14', entry: { day: confirmed() } }];
    expect(datesToPrune(entries, CUTOFF)).toEqual([]);
  });

  it('keeps an old date with anything still unsent — the phone is its only copy', () => {
    const entries = [{ date: '2026-01-04', entry: { day: confirmed(), eon: { form: {}, updatedAt: 200, syncedAt: 100, ackHash: null, rejectedReason: null } } }];
    expect(datesToPrune(entries, CUTOFF)).toEqual([]);
  });

  it('keeps an old date parked with a refusal, so the reason survives to be fixed', () => {
    const entries = [
      { date: '2026-01-04', entry: { day: { ...confirmed()!, rejectedReason: 'unknown tab' } } },
    ];
    expect(datesToPrune(entries, CUTOFF)).toEqual([]);
  });

  it('judges each date on its own', () => {
    const entries = [
      { date: '2026-01-04', entry: { day: confirmed() } },
      { date: '2026-02-11', entry: { day: unsent() } },
      { date: '2026-03-02', entry: { temps: { readings: { morning: {}, midday: {}, night: {} }, updatedAt: 50, syncedAt: 50, ackHash: 'x', rejectedReason: null } } },
      { date: '2026-08-01', entry: { day: confirmed() } },
    ];
    expect(datesToPrune(entries, CUTOFF)).toEqual(['2026-01-04', '2026-03-02']);
  });

  it('an empty entry is nothing to keep', () => {
    expect(datesToPrune([{ date: '2026-01-04', entry: {} }], CUTOFF)).toEqual(['2026-01-04']);
  });
});
