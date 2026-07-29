/**
 * Thin HTTP client for the Apps Script web apps. POST bodies go as
 * text/plain JSON — Apps Script doesn't answer CORS preflight, and
 * text/plain keeps the request "simple" so no preflight happens.
 */

const TIMEOUT_MS = 15000;

async function run(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) throw new Error(data.error || 'sheet reported an error');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function postJson(url: string, payload: unknown): Promise<unknown> {
  return run(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

export function getJson(url: string, params: Record<string, string>): Promise<unknown> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return run(u.toString(), { method: 'GET' });
}
