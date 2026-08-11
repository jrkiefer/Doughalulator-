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
 *   npx vite-node scripts/import-history.ts -- --json <history.json> --mode live   --url <exec> --secret <s>
 *   npx vite-node scripts/import-history.ts -- --json <history.json> --mode verify --url <exec> --secret <s>
 *
 * `dry` replays everything through the in-process Apps Script harness (the
 * real Code.gs) and diffs the resulting fake sheet against the history file —
 * run it before every `live`. The history file itself stays out of the repo.
 */
import { readFileSync } from 'node:fs';
import { get, loadScript, post } from '../apps-script/harness';
import { defaultConfig } from '../src/config';
import { runDoughCalculation, runEonCalculation } from '../src/core';
import type { BibleId, DoughDayRecord } from '../src/core/types';
import { bibles } from '../src/features/bibleData';
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
if (!jsonPath || !mode || !['dry', 'live', 'verify', 'wipe'].includes(mode)) {
  console.error('usage: --json <history.json> --mode dry|live|verify|wipe [--url <exec> --secret <s>]');
  process.exit(2);
}
const history = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, HistoryEntry>;
const dates = Object.keys(history).sort();

// ————— build the payloads exactly the way App.tsx does —————

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

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
  let tabs = dayRecordToTabWrites(record);

  // Overlay recorded reality.
  const summary = tabs.find((w) => w.tab === 'Summary');
  if (summary) summary.row['Batches Made'] = t.batchesMade;

  const engineFinal = tabs.find((w) => w.tab === 'Final Dough');
  if (e.finalDoughUnrecorded) {
    tabs = tabs.filter((w) => w.tab !== 'Final Dough');
  } else if (e.finalDough) {
    const fd = e.finalDough;
    const engineMatches =
      engineFinal &&
      engineFinal.row['Indi Final'] === fd.indi &&
      engineFinal.row['Small Final'] === fd.small &&
      engineFinal.row['Large Final'] === fd.large &&
      engineFinal.row['Sic Final'] === fd.sic &&
      engineFinal.row['Boli Final'] === fd.boli;
    if (!engineMatches) {
      // Reality differs from the recomputed plan: write the recorded finals
      // alone, with no invented tray/singles split.
      tabs = tabs.filter((w) => w.tab !== 'Final Dough');
      tabs.push({
        tab: 'Final Dough',
        row: {
          Date: date,
          'Indi Final': fd.indi,
          'Small Final': fd.small,
          'Large Final': fd.large,
          'Sic Final': fd.sic,
          'Boli Final': fd.boli,
        },
      });
    }
  }
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
  return { type: 'eon', date, tabs: eonRecordToTabWrites(record) };
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
  const row = (tab: string) => (sheet ? sheet[tab] : null);
  if (e.twoPm) {
    const t = e.twoPm;
    const dc = row('Dough Count');
    const sales = row('Sales');
    const sum = row('Summary');
    if (!dc || !sales || !sum) bad.push(`${date}: missing 2 PM rows`);
    else {
      (['Indi', 'Small', 'Large', 'Sic', 'Boli'] as const).forEach((label, i) => {
        const want = [t.counts.indi, t.counts.small, t.counts.large, t.counts.sic, t.counts.boli][i];
        if (!near(dc[`${label} Have`], want)) bad.push(`${date} Dough Count ${label} Have: ${dc[`${label} Have`]} != ${want}`);
      });
      if (!near(sales['Forecast Tonight $'], t.todayForecast)) bad.push(`${date} forecast: ${sales['Forecast Tonight $']}`);
      if (!near(sales['Current Sales $'], t.currentSales)) bad.push(`${date} current: ${sales['Current Sales $']}`);
      if (!near(sales['Forecast Tomorrow $'], t.tomorrowForecast)) bad.push(`${date} tomorrow: ${sales['Forecast Tomorrow $']}`);
      if (!near(sum['Batches Made'], t.batchesMade)) bad.push(`${date} batches made: ${sum['Batches Made']} != ${t.batchesMade}`);
    }
    const fd = row('Final Dough');
    if (e.finalDough) {
      if (!fd) bad.push(`${date}: missing Final Dough row`);
      else {
        (['Indi', 'Small', 'Large', 'Sic', 'Boli'] as const).forEach((label, i) => {
          const want = [e.finalDough!.indi, e.finalDough!.small, e.finalDough!.large, e.finalDough!.sic, e.finalDough!.boli][i];
          if (!near(fd[`${label} Final`], want)) bad.push(`${date} Final ${label}: ${fd[`${label} Final`]} != ${want}`);
        });
      }
    }
    if (e.finalDoughUnrecorded && fd) bad.push(`${date}: Final Dough row exists but should be absent`);
  }
  if (e.eon) {
    const eon = row('EON Count');
    if (!eon) bad.push(`${date}: missing EON Count row`);
    else {
      if (!near(eon['Final Sales $'], e.eon.finalSales)) bad.push(`${date} EON sales: ${eon['Final Sales $']} != ${e.eon.finalSales}`);
      if (e.eon.counts) {
        (['Indi', 'Small', 'Large', 'Sic', 'Boli'] as const).forEach((label, i) => {
          const want = [e.eon!.counts!.indi, e.eon!.counts!.small, e.eon!.counts!.large, e.eon!.counts!.sic, e.eon!.counts!.boli][i];
          if (!near(eon[`${label} Have`], want)) bad.push(`${date} EON ${label} Have: ${eon[`${label} Have`]} != ${want}`);
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
    const SECRET = 'IMPORT-DRY-RUN';
    const script = loadScript('dough', SECRET);
    script.fns.setup();
    for (const p of payloads) {
      const answer = post(script, { secret: SECRET, ...p });
      if (answer.ok !== true) {
        console.error(`REJECTED ${p.type} ${p.date}: ${String(answer.error)}`);
        process.exit(1);
      }
    }
    console.log(`dry run: all ${payloads.length} payloads accepted by the real backend code`);
    const problems = dates.flatMap((date) => {
      const answer = get(script, { secret: SECRET, action: 'date', date });
      return diffDate(date, history[date], answer.ok === true ? (answer.tabs as SheetDate) : null);
    });
    report(problems);
  }

  const url = arg('url');
  const secret = arg('secret');
  if (!url || !secret) {
    console.error(`mode ${mode} needs --url and --secret`);
    process.exit(2);
  }

  if (mode === 'wipe') {
    // Owner-approved reset before a filtered re-import: erases every data row
    // in the DOUGH sheet (bible mirrors and Dough Use formulas survive).
    // Refuses to run without the same confirm phrase the backend demands.
    if (arg('confirm') !== 'WIPE ALL DATA') {
      console.error("wipe mode needs --confirm 'WIPE ALL DATA'");
      process.exit(2);
    }
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, type: 'wipe', confirm: 'WIPE ALL DATA' }),
    });
    const body = await res.text();
    let answer: { ok?: boolean; wiped?: number; error?: string } = {};
    try {
      answer = JSON.parse(body) as typeof answer;
    } catch {
      answer = {};
    }
    if (answer.ok !== true) {
      // Silence here would be dangerous: the next step re-imports onto a sheet
      // the operator believes is empty.
      console.error(`wipe FAILED: ${answer.error ?? body}`);
      process.exit(1);
    }
    console.log(`wiped ${answer.wiped} rows`);
    return;
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
            body: JSON.stringify({ secret, ...p }),
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
    u.searchParams.set('secret', secret);
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
