/**
 * Narrow an unknown value to a plain string-keyed object.
 *
 * This is the guard every parser in the app reaches for when reading JSON that
 * came from disk, `localStorage`, a Tauri command, or an extension manifest.
 * The two easy-to-miss cases are `null` (`typeof null === "object"`) and
 * arrays (also `"object"`, and indexing one by a string key silently yields
 * `undefined` instead of failing), so both are excluded here rather than at
 * each of the dozen call sites that used to re-declare this.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
