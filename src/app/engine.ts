/**
 * The composition root: the pure engine wired to real storage, a real network
 * and a real clock. Everything here is about turning what the owner typed into
 * the payloads the two notebooks expect — App.tsx below is only the screen.
 */
import { defaultConfig, type BibleId } from '../config';
import { computeAmUse, computeHave, runDoughCalculation, runEonCalculation, selectBibleId } from '../core';
import type { DoughDayRecord } from '../core/types';
import { bibles } from '../data/bibles';
import { emptyEonForm } from '../features/eon/formState';
import { parseCounts, toNumOrNull } from '../features/shared/counts';
import type { Rounding } from '../features/twoPm/DaysWork';
import { emptyTwoPmForm, type TwoPmForm } from '../features/twoPm/formState';
import { postJson } from '../services/client';
import { addDays, syncBibles, type FetchedDay } from '../services/doughService';
import {
  clearEntry,
  freshMeta,
  listCachedDates,
  loadEntry,
  saveEntry,
  type DateEntry,
} from '../services/local';
import { dayRecordToTabWrites, eonRecordToTabWrites } from '../services/mapping';
import { DOUGH_URL, TEMPS_URL } from '../services/sheets';
import { createSyncEngine, type RecordType } from '../services/sync';
import { tempsEntryToPayload } from '../services/tempsService';

const cfg = defaultConfig;

/**
 * The record types a dough-sheet fetch speaks for. Temps are deliberately not
 * here: they live in the other notebook, so a dough fetch must never clear them.
 */
export const DOUGH_SHEET_RECORDS = ['day', 'eon'] as const satisfies readonly RecordType[];

/** A record worth sending: at least one field the owner actually filled in. */
export function formHasContent(form: Record<string, string>): boolean {
  return Object.values(form).some((v) => v.trim() !== '');
}

/**
 * The day record for a date, straight from form state (pure, blank-aware).
 * The two roundings go in as the owner's RAW taps — the engine resolves them,
 * so a night nobody tapped keeps re-resolving as the numbers change.
 */
export function buildDayRecord(
  date: string,
  form: TwoPmForm,
  rounding: Rounding,
  bibleOverride: BibleId | undefined,
  forecastRound: Rounding = null,
): DoughDayRecord {
  return runDoughCalculation(
    {
      date,
      counts: parseCounts(form),
      todayForecastRaw: toNumOrNull(form.todayForecast),
      currentSalesRaw: toNumOrNull(form.currentSales),
      tomorrowForecastRaw: toNumOrNull(form.tomorrowForecast),
      bibleOverride,
      forecastRound,
      batchRound: rounding,
    },
    bibles,
    cfg,
  );
}

/**
 * Dough used before 2 PM: last night's close against this afternoon's count.
 * Yesterday's EON lives in the phone's own store; without it the morning's
 * use is simply unknown (a closed day), which is what blank means here.
 */
function amUseFor(date: string, record: DoughDayRecord) {
  const yesterday = loadEntry(addDays(date, -1));
  const eonForm = yesterday?.eon?.form;
  if (!eonForm || !formHasContent(eonForm)) return null;
  const eonHave = computeHave(parseCounts({ ...emptyEonForm, ...eonForm }), cfg);
  return computeAmUse(eonHave, record.have, record.currentSales);
}

/** Write a sheet fetch into a date's entry (form-shaped; blanks stay blank). */
export function applyFetchedToEntry(entry: DateEntry, fetched: FetchedDay, date: string): void {
  const now = Date.now();
  const overrideFrom = (bible: FetchedDay['bible']) =>
    bible && bible !== selectBibleId(date, cfg) ? bible : null;
  if (fetched.sales || fetched.counts || fetched.rounding || fetched.forecastRound) {
    entry.day = {
      form: { ...emptyTwoPmForm, ...(fetched.counts ?? {}), ...(fetched.sales ?? {}) },
      rounding: fetched.rounding,
      forecastRound: fetched.forecastRound,
      bibleOverride: overrideFrom(fetched.bible),
      ...freshMeta(now),
    };
  }
  if (fetched.eonCounts || (fetched.finalSales !== null && fetched.finalSales !== '')) {
    entry.eon = {
      form: { ...emptyEonForm, ...(fetched.eonCounts ?? {}), finalSales: fetched.finalSales ?? '' },
      ...freshMeta(now),
    };
  }
}

export const engine = createSyncEngine({
  now: () => Date.now(),
  loadEntry,
  saveEntry,
  clearEntry,
  listDates: listCachedDates,
  buildPayload: (type, date, entry) => {
    if (type === 'day') {
      const day = entry.day;
      if (!day || (!formHasContent(day.form) && day.rounding === null)) return null;
      const form = { ...emptyTwoPmForm, ...day.form };
      const record = buildDayRecord(date, form, day.rounding, day.bibleOverride ?? undefined, day.forecastRound ?? null);
      return { type: 'day', date, tabs: dayRecordToTabWrites(record, amUseFor(date, record)) };
    }
    if (type === 'eon') {
      const eon = entry.eon;
      if (!eon || !formHasContent(eon.form)) return null;
      const eonForm = { ...emptyEonForm, ...eon.form };
      const day = entry.day;
      const dayRecord =
        day && (formHasContent(day.form) || day.rounding !== null)
          ? buildDayRecord(date, { ...emptyTwoPmForm, ...day.form }, day.rounding, day.bibleOverride ?? undefined, day.forecastRound ?? null)
          : null;
      const record = runEonCalculation(
        {
          date,
          counts: parseCounts(eonForm),
          finalSalesRaw: toNumOrNull(eonForm.finalSales),
          manualTomorrowForecastRaw: toNumOrNull(eonForm.manualTomorrowForecast),
          bibleOverride: day?.bibleOverride ?? undefined,
        },
        dayRecord,
        bibles,
        cfg,
      );
      return { type: 'eon', date, tabs: eonRecordToTabWrites(record, dayRecord?.bibleUsed, dayRecord ? amUseFor(date, dayRecord) : null) };
    }
    return entry.temps ? tempsEntryToPayload(date, entry.temps, cfg) : null;
  },
  post: (target, payload, opts) =>
    postJson(target === 'dough' ? DOUGH_URL : TEMPS_URL, payload, opts),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id),
});

/**
 * Push the two bible tables to their read-only mirror tabs, once per app start.
 *
 * This is not housekeeping. `refreshBibleBuild()` in the dough script gives up
 * silently when a mirror tab is empty, so after an Erase all data the
 * self-building bible would just stop suggesting with nothing to show why.
 * Sending them at boot makes the mirror heal itself; the script compares a
 * content hash and does nothing at all when they already match, so the standing
 * cost is one small request per start.
 */
export function mirrorBibles(): void {
  void syncBibles(bibles);
}
