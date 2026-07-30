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

async function run(url: string, init: RequestInit): Promise<Outcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, redirect: 'follow', signal: controller.signal });
    if (!res.ok) return { kind: 'retryable', error: `HTTP ${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
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
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return run(u.toString(), { method: 'GET' });
}
