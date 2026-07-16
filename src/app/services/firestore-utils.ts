/**
 * Firestore `Timestamp` → `Date`, or `null` while a server timestamp is still
 * pending. Duck-typed rather than `instanceof Timestamp` so it also accepts the
 * estimated timestamps `serverTimestamps: 'estimate'` hands back, and so callers
 * don't have to import Firestore types just to read a date.
 *
 * `createdAt` is typed `unknown` across the app's models on purpose — this is the
 * one place that assumption gets unwrapped.
 */
export function toDate(ts: unknown): Date | null {
  return ts && typeof (ts as { toDate?: unknown }).toDate === 'function'
    ? (ts as { toDate: () => Date }).toDate()
    : null;
}
