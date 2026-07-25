/**
 * The `useState`-style setter argument: either the next value directly, or a
 * function that derives it from the current one.
 *
 * Stores across the app expose setters with this shape so callers can migrate
 * between `useState` and a store without changing the call site.
 */
export type ValueUpdater<T> = T | ((current: T) => T);

/** Convenience alias for the most common updater. */
export type BooleanUpdater = ValueUpdater<boolean>;

/**
 * Apply a `ValueUpdater` against the current value.
 *
 * The cast is needed because `T` may itself be a function type; TypeScript
 * cannot narrow `T | ((current: T) => T)` by `typeof === "function"` in that
 * case. No store in this app holds a function as its value, so the runtime
 * check is the correct discriminator in practice.
 */
export function resolveValue<T>(current: T, value: ValueUpdater<T>): T {
  return typeof value === "function"
    ? (value as (current: T) => T)(current)
    : value;
}
