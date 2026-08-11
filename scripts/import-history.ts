/**
 * One-off (re-runnable) history import: replays the owner's pre-app tracking
 * data through the REAL calculation engine and posts the exact payloads the
 * app itself would have sent, so past dates land in the dough sheet as if the
 * app had been in use all along.
 *
 * Recorded reality always wins over recomputation: counts, sales, batches
 * made, and post-make final dough are written verbatim from the history file;
 * the engine only fills the derived tabs (Sales, Use Tonight, Left, Need
 * Tomorrow, Make, Batches, EON Check). Dates whose "final dough" was never
 * truly recorded get NO Final Dough row — a made-up number would poison the
 * sheet's PM-use formulas.
 *
 * Run with vite-node (ships with vitest):
 *   npx vite-node scripts/import-history.ts -- --json <history.json> --mode dry
 *   npx vite-node scripts/import-history.ts -- --json <history.json> --mode live   --url <exec>
 *   npx vite-node scripts/import-history.ts -- --json <history.json> --mode verify --url <exec>
 *
 * `dry` replays everything through the in-process Apps Script harness (the
 * real Code.gs) and diffs the resulting fake sheet against the history file —
 * run it before every `live`. The history file itself stays out of the repo.
 */
import { readFileSync } from 'node:fs';
import { get, loadScript, post } from '../apps-script/test/harness';
import { defaultConfig } from '../src/config';
import { computeAmUse, computeHave, runDoughCalculation, runEonCalculation } from '../src/core';
import type { AmUse, BibleId, DoughDayRecord } from '../src/core/types';
import { bibles } from '../src/data/bibles';
import { emptyEonForm, type EonForm } from '../src/features/eon/formState';
import { parseCounts, toNumOrNull } from '../src/features/shared/counts';
import { emptyTwoPmForm, type TwoPmForm } from '../src/features/twoPm/formState';
import { dayRecordToTabWrites, eonRecordToTabWrites, type TabWrite } from '../src/services/mapping';

const cfg = defaultConfig;

interface Sizes {
  indi: number;
  small: number;
  large: number;
  sic: number;
  boli: number;
}

interface HistoryEntry {
  twoPm?: {
    todayForecast: number;
    currentSales: number;
    tomorrowForecast: number;
    counts: Sizes;
    batchesMade: number;
    bible: BibleId;
    batchRounding: 'down' | 'up' | null;
  };
  finalDough?: Sizes;
  finalDoughUnrecorded?: boolean;
  eon?: { finalSales: number | null; counts: Sizes | null };
}

interface Payload {
  type: 'day' | 'eon';
  date: string;
  tabs: TabWrite[];
}

// ————— CLI —————

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const jsonPath = arg('json');
const mode = arg('mode');
if (!jsonPath || !mode || !['dry', 'live', 'verify'].includes(mode)) {
  console.error('usage: --json <history.json> --mode dry|live|verify [--url <exec>]');
  process.exit(2);
}
const history = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, HistoryEntry>;
const dates = Object.keys(history).sort();

// ————— build the payloads exactly the way App.tsx does —————

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Yesterday's closing count, in balls — what the morning's use is measured from. */
function eonHaveOn(date: string) {
  const counts = history[date]?.eon?.counts;
  if (!counts) return null;
  return computeHave(
    parseCounts({
      ...emptyEonForm,
      indiSingles: str(counts.indi),
      smallSingles: str(counts.small),
      largeSingles: str(counts.large),
      sicSingles: str(counts.sic),
      boliSingles: str(counts.boli),
    }),
    cfg,
  );
}

/** The morning's use for a date: last night's close against this afternoon's count. */
function amUseFor(date: string, record: DoughDayRecord): AmUse | null {
  const [y, m, d] = date.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  const yesterday = eonHaveOn(prev);
  if (!yesterday) return null;
  return computeAmUse(yesterday, record.have, record.currentSales);
}

function buildDay(date: string, e: HistoryEntry): { record: DoughDayRecord; payload: Payload } | null {
  const t = e.twoPm;
  if (!t) return null;
  // The old system tracked whole-ball totals only, so counts import as
  // singles — the Have columns carry the truth either way.
  const form: TwoPmForm = {
    ...emptyTwoPmForm,
    todayForecast: str(t.todayForecast),
    currentSales: str(t.currentSales),
    tomorrowForecast: str(t.tomorrowForecast),
    indiSingles: str(t.counts.indi),
    smallSingles: str(t.counts.small),
    largeSingles: str(t.counts.large),
    sicSingles: str(t.counts.sic),
    boliSingles: str(t.counts.boli),
  };
  const base = runDoughCalculation(
    {
      date,
      counts: parseCounts(form),
      todayForecastRaw: toNumOrNull(form.todayForecast),
      currentSalesRaw: toNumOrNull(form.currentSales),
      tomorrowForecastRaw: toNumOrNull(form.tomorrowForecast),
      bibleOverride: t.bible,
    },
    bibles,
    cfg,
  );
  // The recorded rounding note wins; otherwise recover the choice from which
  // option's batch count matches what was actually made.
  const rounding =
    t.batchRounding ??
    (base.batchDown?.batches === t.batchesMade
      ? 'down'
      : base.batchUp?.batches === t.batchesMade
        ? 'up'
        : null);
  const record: DoughDayRecord = { ...base, chosenBatchOption: rounding };
  // Only the counts travel: the sheet's formulas work out the make, the
  // batches and the final dough from them.
  const tabs = dayRecordToTabWrites(record, amUseFor(date, record));
  return { record, payload: { type: 'day', date, tabs } };
}

function buildEon(date: string, e: HistoryEntry, dayRecord: DoughDayRecord | null): Payload | null {
  // An entry with neither sales nor counts would post a date-only row, which
  // the backend terminally rejects — App.tsx guards the same case.
  if (!e.eon || (e.eon.finalSales === null && !e.eon.counts)) return null;
  const form: EonForm = {
    ...emptyEonForm,
    finalSales: str(e.eon.finalSales),
    indiSingles: str(e.eon.counts?.indi),
    smallSingles: str(e.eon.counts?.small),
    largeSingles: str(e.eon.counts?.large),
    sicSingles: str(e.eon.counts?.sic),
    boliSingles: str(e.eon.counts?.boli),
  };
  const record = runEonCalculation(
    {
      date,
      counts: parseCounts(form),
      finalSalesRaw: toNumOrNull(form.finalSales),
      manualTomorrowForecastRaw: toNumOrNull(form.manualTomorrowForecast),
      bibleOverride: e.twoPm?.bible,
    },
    dayRecord,
    bibles,
    cfg,
  );
  return {
    type: 'eon',
    date,
    tabs: eonRecordToTabWrites(
      record,
      dayRecord?.bibleUsed ?? e.twoPm?.bible,
      dayRecord ? amUseFor(date, dayRecord) : null,
    ),
  };
}

const payloads: Payload[] = [];
for (const date of dates) {
  const e = history[date];
  const day = buildDay(date, e);
  if (day) payloads.push(day.payload);
  const eon = buildEon(date, e, day?.record ?? null);
  if (eon) payloads.push(eon);
}
console.log(`built ${payloads.length} payloads across ${dates.length} dates`);

// ————— shared verification: diff sheet rows against the history file —————

type SheetDate = Record<string, Record<string, string> | null>;

function near(a: string | undefined, b: number | null): boolean {
  if (b === null) return !a || a === '';
  return a !== undefined && Math.abs(Number(a) - b) < 0.005;
}

function diffDate(date: string, e: HistoryEntry, sheet: SheetDate | null): string[] {
  const bad: string[] = [];
  const day = sheet ? sheet['2PM Dough Count'] : null;
  const eon = sheet ? sheet['EON Dough Count'] : null;

  if (e.twoPm) {
    const t = e.twoPm;
    if (!day) {
      bad.push(`${date}: missing the 2 PM row`);
    } else {
      const cols: [string, number][] = [
        ['Indi Count', t.counts.indi], ['Small Count', t.counts.small],
        ['Large Count', t.counts.large], ['Sic Count', t.counts.sic], ['Boli Count', t.counts.boli],
        ["Today's Forecast", t.todayForecast], ['Current Sales', t.currentSales],
        ["Tomorrow's Forecast", t.tomorrowForecast],
      ];
      cols.forEach(([key, want]) => {
        if (!near(day[key], want)) bad.push(`${date} ${key}: ${day[key]} != ${want}`);
      });
      if (day['Bible'] !== t.bible) bad.push(`${date} bible: ${day['Bible']} != ${t.bible}`);
    }
  }

  if (e.eon) {
    if (!eon) {
      bad.push(`${date}: missing the EON row`);
    } else {
      if (!near(eon['EON Sales'], e.eon.finalSales)) {
        bad.push(`${date} EON sales: ${eon['EON Sales']} != ${e.eon.finalSales}`);
      }
      if (e.eon.counts) {
        const cols: [string, number][] = [
          ['EON Indi Count', e.eon.counts.indi], ['EON Small Count', e.eon.counts.small],
          ['EON Large Count', e.eon.counts.large], ['EON Sic Count', e.eon.counts.sic],
          ['EON Boli Count', e.eon.counts.boli],
        ];
        cols.forEach(([key, want]) => {
          if (!near(eon[key], want)) bad.push(`${date} ${key}: ${eon[key]} != ${want}`);
        });
      }
    }
  }
  return bad;
}

function report(problems: string[]): never {
  if (problems.length === 0) {
    console.log('verification clean: every imported value matches the history file');
    process.exit(0);
  }
  console.error(`${problems.length} mismatches:`);
  problems.slice(0, 40).forEach((p) => console.error('  ' + p));
  process.exit(1);
}

// ————— modes —————

async function main() {
  if (mode === 'dry') {
    const script = loadScript('dough');
    script.fns.setup();
    for (const p of payloads) {
      const answer = post(script, p);
      if (answer.ok !== true) {
        console.error(`REJECTED ${p.type} ${p.date}: ${String(answer.error)}`);
        process.exit(1);
      }
    }
    console.log(`dry run: all ${payloads.length} payloads accepted by the real backend code`);
    const problems = dates.flatMap((date) => {
      const answer = get(script, { action: 'date', date });
      return diffDate(date, history[date], answer.ok === true ? (answer.tabs as SheetDate) : null);
    });
    report(problems);
  }

  const url = arg('url');
  if (!url) {
    console.error(`mode ${mode} needs --url`);
    process.exit(2);
  }

  if (mode === 'live') {
    let done = 0;
    for (const p of payloads) {
      let sent = false;
      for (const wait of [0, 2000, 4000, 8000, 16000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          const res = await fetch(url, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(p),
          });
          if (!res.ok) continue; // HTTP-level hiccup: retry
          const answer = (await res.json()) as { ok?: boolean; retryable?: boolean; error?: string };
          if (answer.ok === true) {
            sent = true;
            break;
          }
          if (answer.retryable) continue; // lock busy: retry
          console.error(`REJECTED ${p.type} ${p.date}: ${answer.error}`);
          process.exit(1);
        } catch {
          continue; // network hiccup: retry
        }
      }
      if (!sent) {
        console.error(`gave up on ${p.type} ${p.date} after retries — re-run live mode to resume (merge-upsert makes it safe)`);
        process.exit(1);
      }
      done++;
      if (done % 10 === 0 || done === payloads.length) console.log(`posted ${done}/${payloads.length}`);
    }
    console.log('live import complete — now run --mode verify');
  }

  if (mode === 'verify') {
    const u = new URL(url);
        u.searchParams.set('action', 'range');
    u.searchParams.set('from', dates[0]);
    u.searchParams.set('to', dates[dates.length - 1]);
    const res = await fetch(u, { redirect: 'follow' });
    const answer = (await res.json()) as { ok?: boolean; dates?: Record<string, SheetDate>; error?: string };
    if (answer.ok !== true || !answer.dates) {
      console.error(`range read failed: ${answer.error}`);
      process.exit(1);
    }
    const problems = dates.flatMap((date) => diffDate(date, history[date], answer.dates![date] ?? null));
    report(problems);
  }
}

void main();
