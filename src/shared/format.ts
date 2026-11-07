/** "3h 48m" / "12m" for a duration in ms. */
export function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

/** Batches normally come back within minutes; past this the age is worth showing. */
export const SLOW_BATCH_MS = 15 * 60_000

/** Age of the oldest in-flight batch when it's slow enough to mention, else null. */
export function slowBatchAge(oldestBatchAt: number | null, now = Date.now()): string | null {
  if (oldestBatchAt === null || now - oldestBatchAt < SLOW_BATCH_MS) return null
  return formatAge(now - oldestBatchAt)
}
