import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, postJson } from './client';

function mockFetch(impl: (typeof fetch) | 'reject' | 'hang') {
  const fn =
    impl === 'reject'
      ? vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      : impl === 'hang'
        ? vi.fn().mockImplementation(
            (_url: string, init?: RequestInit) =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () =>
                  reject(new DOMException('aborted', 'AbortError')),
                );
              }),
          )
        : vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(body: unknown, status = 200) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the three-outcome transport (§3d)', () => {
  it('ok:true → success with the data', async () => {
    mockFetch(jsonResponse({ ok: true, saved: 'day' }));
    const outcome = await postJson('https://sheet.test/exec', { type: 'day' });
    expect(outcome).toMatchObject({ kind: 'ok', data: { saved: 'day' } });
  });

  it('a network failure is retryable', async () => {
    mockFetch('reject');
    const outcome = await postJson('https://sheet.test/exec', {});
    expect(outcome.kind).toBe('retryable');
  });

  it('an HTTP transport error is retryable', async () => {
    mockFetch(jsonResponse({ anything: true }, 502));
    const outcome = await getJson('https://sheet.test/exec', { action: 'ping' });
    expect(outcome.kind).toBe('retryable');
  });

  it('a timeout is retryable', async () => {
    vi.useFakeTimers();
    mockFetch('hang');
    const pending = postJson('https://sheet.test/exec', {});
    await vi.advanceTimersByTimeAsync(20000);
    const outcome = await pending;
    expect(outcome.kind).toBe('retryable');
  });

  it('ok:false with retryable:true (script lock busy) is network-class', async () => {
    mockFetch(jsonResponse({ ok: false, retryable: true, error: 'busy — try again' }));
    const outcome = await postJson('https://sheet.test/exec', {});
    expect(outcome).toEqual({ kind: 'retryable', error: 'busy — try again' });
  });

  it('ok:false without the flag is a terminal rejection with the reason', async () => {
    mockFetch(jsonResponse({ ok: false, error: 'bad secret' }));
    const outcome = await postJson('https://sheet.test/exec', {});
    expect(outcome).toEqual({ kind: 'rejected', reason: 'bad secret' });
  });
});
