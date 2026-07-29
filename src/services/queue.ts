import { postJson } from './client';
import { queuedItems, replaceQueue } from './local';
import type { SheetSettings } from './settings';

export interface FlushResult {
  sent: number;
  remaining: number;
}

/**
 * Try to push every queued save to its sheet, oldest first, keeping order
 * per target. Called on app open; anything that still fails stays queued
 * for next time.
 */
export async function flushQueue(settings: SheetSettings): Promise<FlushResult> {
  const items = queuedItems();
  if (items.length === 0) return { sent: 0, remaining: 0 };

  const stillQueued: typeof items = [];
  const blocked = { dough: false, temps: false };
  let sent = 0;

  for (const item of items) {
    const url = item.target === 'dough' ? settings.doughUrl : settings.tempsUrl;
    const secret = item.target === 'dough' ? settings.doughSecret : settings.tempsSecret;
    if (blocked[item.target] || !url.trim()) {
      stillQueued.push(item);
      continue;
    }
    try {
      // Payloads are queued without the secret; inject the current one now.
      await postJson(url, { secret, ...(item.payload as object) });
      sent++;
    } catch {
      blocked[item.target] = true; // keep order: don't let a newer save jump an older one
      stillQueued.push(item);
    }
  }

  replaceQueue(stillQueued);
  return { sent, remaining: stillQueued.length };
}
