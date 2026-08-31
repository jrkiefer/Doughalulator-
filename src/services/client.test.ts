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
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('setup mistakes get a plain answer, not an endless retry', () => {
  it('a typo\'d address is rejected in words instead of throwing', async () => {
    // No fetch stubbed on purpose: this must never reach the network.
    const outcome = await getJson('script.google.com/macros/s/abc/exec', { action: 'ping' });
    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' && outcome.reason).toMatch(/https:\/\//);
  });

  it('an address that PARSES but is not https is refused, not retried for ever', async () => {
    // The trap: `new URL('htps://…')` is perfectly valid, so the shape check
    // waves it through, fetch fails at the network, and that reads as a network
    // problem — which the retry ladder would then repeat every five minutes.
    const outcome = await getJson('htps://script.google.com/macros/s/abc/exec', { action: 'ping' });
    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' && outcome.reason).toMatch(/https:\/\//);
  });

  it('a save to a bad address is refused too, not just Test Connection', async () => {
    const outcome = await postJson('htps://script.google.com/macros/s/abc/exec', { type: 'day' });
    expect(outcome.kind).toBe('rejected');
  });

  it('plain http against localhost still works, so the app can be tested', async () => {
    mockFetch(jsonResponse({ ok: true }));
    const outcome = await postJson('http://localhost:8787/exec', { type: 'day' });
    expect(outcome.kind).toBe('ok');
  });

  it('a 404 is a wrong address, not something to retry for ever', async () => {
    mockFetch(jsonResponse({ error: 'not found' }, 404));
    const outcome = await getJson('https://sheet.test/exec', { action: 'ping' });
    expect(outcome.kind).toBe('rejected');
  });

  it('a 500 IS worth retrying', async () => {
    mockFetch(jsonResponse({}, 500));
    const outcome = await getJson('https://sheet.test/exec', { action: 'ping' });
    expect(outcome.kind).toBe('retryable');
  });

  it('an HTML sign-in page instead of data names the real problem', async () => {
    mockFetch(() => Promise.resolve(new Response('<!doctype html><title>Sign in</title>', { status: 200 })));
    const outcome = await getJson('https://sheet.test/exec', { action: 'ping' });
    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' && outcome.reason).toMatch(/Anyone/);
  });
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
