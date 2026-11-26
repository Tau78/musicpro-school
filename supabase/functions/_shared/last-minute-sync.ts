import { edgeUrlEnvFromDeno, publicSchoolUrl } from './public-url.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

function internalSecret(): string {
  return (
    Deno.env.get('ISCRIZIONE_INTERNAL_SECRET')?.trim() ||
    Deno.env.get('CRON_SECRET')?.trim() ||
    ''
  );
}

/** Dopo confirmed in fascia serata: sync campagne LM + digest su Vercel. */
export function triggerLastMinuteSyncAfterConfirm(bookingId: string): boolean {
  const id = bookingId.trim();
  if (!id) return false;

  const secret = internalSecret();
  if (!secret) {
    console.warn('[last-minute-sync] skip: secret interno assente');
    return false;
  }

  const base = publicSchoolUrl(edgeUrlEnvFromDeno()).replace(/\/$/, '');
  if (!base) {
    console.warn('[last-minute-sync] skip: SCHOOL_PUBLIC_URL assente');
    return false;
  }

  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(`${base}/api/internal/last-minute/sync-day`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
          'x-iscrizione-internal-secret': secret,
        },
        body: JSON.stringify({ booking_id: id }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn('[last-minute-sync] HTTP', res.status, text.slice(0, 200));
      }
    } catch (err) {
      console.warn(
        '[last-minute-sync]',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const pending = run();
  try {
    EdgeRuntime.waitUntil(pending);
  } catch {
    void pending;
  }
  return true;
}