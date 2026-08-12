/**
 * Thin HTTP client for the Apps Script web apps. POST bodies go as
 * text/plain JSON — Apps Script doesn't answer CORS preflight, and
 * text/plain keeps the request "simple" so no preflight happens.
 *
 * Every call resolves to one of THREE outcomes — it never throws:
 *   ok        — the script answered { ok: true }
 *   retryable — no internet / timeout / transport error / script busy
 *   rejected  — the script answered { ok: false } with a terminal reason
 *               (bad secret, validation refusal). Retrying won't help.
 */

const TIMEOUT_MS = 15000;

export type Outcome =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'retryable'; error: string }
  | { kind: 'rejected'; reason: string };

/**
 * HTTP statuses that mean "this address is wrong", not "try again later".
 * Retrying these forever would park the app on OFFLINE — WILL RETRY and never
 * tell the owner the one thing they need to know.
 */
const DEAD_ADDRESS_STATUS = new Set([400, 401, 403, 404, 405, 410]);

async function run(url: string, init: RequestInit): Promise<Outcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, redirect: 'follow', signal: controller.signal });
    if (!res.ok) {
      return DEAD_ADDRESS_STATUS.has(res.status)
        ? { kind: 'rejected', reason: `the sheet's web address answered ${res.status} — re-copy it from Deploy → Manage deployments` }
        : { kind: 'retryable', error: `HTTP ${res.status}` };
    }
    // A sign-in or error PAGE instead of JSON means the deployment's Access
    // isn't "Anyone" — retrying can't fix that, only re-deploying can.
    const body = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {
        kind: 'rejected',
        reason: 'the sheet answered with a web page, not data — re-deploy it with Access set to "Anyone"',
      };
    }
    if (data.ok === true) return { kind: 'ok', data };
    // The script said no. A `retryable: true` flag (e.g. lock busy) is
    // network-class; anything else is terminal.
    const reason = typeof data.error === 'string' ? data.error : 'sheet reported an error';
    if (data.retryable === true) return { kind: 'retryable', error: reason };
    return { kind: 'rejected', reason };
  } catch (err) {
    // Timeouts, offline, DNS, CORS — all worth retrying later.
    return { kind: 'retryable', error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function postJson(
  url: string,
  payload: unknown,
  opts: { keepalive?: boolean } = {},
): Promise<Outcome> {
  return run(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    keepalive: opts.keepalive,
  });
}

export function getJson(url: string, params: Record<string, string>): Promise<Outcome> {
  // new URL() THROWS on a typo'd address. Left unguarded it rejects the promise
  // and Settings sits on "Testing…" for ever with nothing to show for it — the
  // most likely mistake there is, pasting an address out of an email.
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return Promise.resolve({
      kind: 'rejected',
      reason: "that doesn't look like a web address — it should start with https://",
    });
  }
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return run(u.toString(), { method: 'GET' });
}
