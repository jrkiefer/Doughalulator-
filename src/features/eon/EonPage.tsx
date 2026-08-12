import { defaultConfig, type BibleId } from "../../config";
import { runEonCalculation } from "../../core";
import type { DoughDayRecord, SizeKey } from "../../core/types";
import { bibles } from "../../data/bibles";
import { CountCards } from "../shared/CountCards";
import { fmtMaybe, parseCounts, toNumOrNull } from "../shared/counts";
import { numericChangeHandler } from "../shared/inputs";
import { SectionHead } from "../shell/SectionHead";
import { DollarEcho } from "../twoPm/SalesCard";
import type { EonForm } from "./formState";

const OUTLOOK_ROWS: { key: SizeKey; name: string; color: string }[] = [
  { key: "indi", name: "INDI", color: "var(--indi)" },
  { key: "small", name: "SM", color: "var(--small)" },
  { key: "large", name: "LG", color: "var(--large)" },
  { key: "sic", name: "SIC", color: "var(--sic)" },
  { key: "boli", name: "BOLI", color: "var(--boli)" },
];

/** "+2 tr" / "−2 tr" / "0 tr" — a true minus sign, not a hyphen. */
function traysLabel(trays: number): string {
  const sign = trays > 0 ? "+" : trays < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(trays)} tr`;
}

/** "+26 balls" / "\u221219 balls" — the same true minus the tray line uses. */
function ballsLabel(diff: number, unit = "balls"): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(diff)} ${unit}`;
}

export function EonPage(props: {
  date: string;
  bibleOverride: BibleId | undefined;
  dayRecord: DoughDayRecord | null;
  form: EonForm;
  onFormChange: (patch: Partial<EonForm>) => void;
  synced: boolean;
}) {
  const cfg = defaultConfig;
  const { form, dayRecord } = props;

  const record = runEonCalculation(
    {
      date: props.date,
      counts: parseCounts(form),
      finalSalesRaw: toNumOrNull(form.finalSales),
      manualTomorrowForecastRaw: toNumOrNull(form.manualTomorrowForecast),
      bibleOverride: props.bibleOverride,
    },
    dayRecord,
    bibles,
    cfg,
  );

  // The box shows the afternoon's forecast until something is typed here; from
  // then on the typed figure is what counts, and clearing it hands back.
  const manualTyped = form.manualTomorrowForecast.trim() !== "";
  const twoPmRaw =
    dayRecord?.tomorrowForecastRaw === null ||
    dayRecord?.tomorrowForecastRaw === undefined
      ? ""
      : String(dayRecord.tomorrowForecastRaw);
  const forecastShown = manualTyped ? form.manualTomorrowForecast : twoPmRaw;
  // The label reports what actually drove the numbers below, not merely what is
  // in the box: half-typed text like "." is not yet a forecast, and the card
  // must never claim "Manual entry" over figures still coming from the 2 PM save.
  const source =
    record.needSource === "manualForecast"
      ? "Manual entry"
      : record.needSource === "dayRecord"
        ? "From 2 PM save"
        : "No 2 PM save — enter manually";
  const forecastDollars =
    record.needSource === "manualForecast"
      ? record.manualTomorrowForecast
      : (dayRecord?.tomorrowForecast ?? null);
  const outlook = record.outlook;
  const showRows =
    record.flags.tomorrowCheckAvailable &&
    !record.flags.closedTomorrow &&
    outlook;

  return (
    <>
      <div className="band">
        <SectionHead
          num="01"
          title="End of Night Sales"
          note="DOLLARS · 10 = $10,000"
        />
        <div className="card">
          <div className="field-row">
            <span className="label">FINAL SALES</span>
            <div className="input-wrap">
              <input
                className="input"
                type="text"
                inputMode="decimal"
                aria-label="FINAL SALES"
                value={form.finalSales}
                onChange={numericChangeHandler({ decimal: true }, (v) =>
                  props.onFormChange({ finalSales: v }),
                )}
              />
              {props.synced && form.finalSales.trim() !== "" && (
                <span className="chip">saved</span>
              )}
              <DollarEcho raw={form.finalSales} />
            </div>
          </div>
        </div>

        <CountCards
          fields={form}
          onChange={props.onFormChange}
          have={record.eonHave}
          note="CLOSING COUNT"
          synced={props.synced}
        />
      </div>

      <div className="band">
        <SectionHead
          num="08"
          title="EON Outlook"
          note="HAVE VS TOMORROW'S NEED"
        />
        <div className="card outlook-card">
          <div className="outlook-forecast">
            <div>
              <span className="label">TOMORROW'S FORECAST</span>
              <span className="outlook-source">
                {source}
                {forecastDollars !== null &&
                  ` \u00b7 = $${forecastDollars.toLocaleString("en-US")}`}
              </span>
            </div>
            <div className="input-wrap">
              <input
                className="input"
                type="text"
                inputMode="decimal"
                aria-label="TOMORROW'S FORECAST"
                value={forecastShown}
                onChange={numericChangeHandler({ decimal: true }, (v) =>
                  props.onFormChange({ manualTomorrowForecast: v }),
                )}
              />
              {props.synced && manualTyped && (
                <span className="chip">saved</span>
              )}
            </div>
          </div>

          <hr className="dashed-divider" />

          {record.flags.tomorrowCheckAvailable &&
            record.flags.closedTomorrow && (
              <div className="closed-chip">
                Closed tomorrow — nothing needed.
              </div>
            )}

          {!record.flags.tomorrowCheckAvailable && (
            <div className="outlook-empty">
              Enter tomorrow's forecast above to see the outlook.
            </div>
          )}

          {showRows &&
            OUTLOOK_ROWS.map(({ key, name, color }) => {
              const row = outlook!.rows[key];
              const known = row.diff !== null && row.trays !== null;
              return (
                <div
                  className="outlook-row"
                  key={key}
                  style={{ ["--size" as string]: color }}
                >
                  <span className="size-name">
                    <span className="dot" />
                    {name}
                  </span>
                  <span className="outlook-have">{fmtMaybe(row.have)}</span>
                  <span className="outlook-need">vs {fmtMaybe(row.need)}</span>
                  <div className="outlook-diff">
                    {/* Sicilian is a balls-only size, so its ball figure IS the headline. */}
                    <span
                      className={`outlook-diff-trays ${
                        !known
                          ? "none"
                          : key === "sic"
                            ? // Sicilian is clamped at 0, so level reads neutral, never green.
                              row.diff! > 0
                              ? "pos"
                              : "none"
                            : // Everywhere else, exactly level IS covered — green.
                              row.diff! < 0
                              ? "neg"
                              : "pos"
                      }`}
                    >
                      {!known
                        ? "—"
                        : key === "sic"
                          ? ballsLabel(row.diff!)
                          : traysLabel(row.trays!)}
                    </span>
                    {known && key !== "sic" && (
                      <span className="outlook-diff-balls">
                        {ballsLabel(row.diff!)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

          {showRows && outlook!.anyCounted && (
            <div
              className={`outlook-summary${outlook!.shortfallBalls > 0 ? "" : " good"}`}
            >
              {outlook!.shortfallBalls > 0
                ? `Tomorrow we will potentially go into same-day dough by ${
                    outlook!.shortTrays >= 1
                      ? `~${outlook!.shortTrays} ${outlook!.shortTrays === 1 ? "tray" : "trays"}`
                      : "less than a tray"
                  } (${outlook!.shortfallBalls} balls).`
                : `Dough is good \u2713 — ~${outlook!.surplusTrays} ${
                    outlook!.surplusTrays === 1 ? "tray" : "trays"
                  } leftover (${outlook!.surplusBalls} balls).`}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
