/**
 * `localStorage`, or null where reading it throws or it does not exist: outside
 * a browser, or when storage is denied. Callers treat null as nothing stored.
 */
export function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}
