/**
 * Constrain `value` to the inclusive `[min, max]` range, preserving fractional
 * input. Use this for continuous quantities — pane sizes, zoom factors, scroll
 * offsets, opacity.
 *
 * If you need a whole number out, call `clampInt` instead of rounding at the
 * call site, so the rounding is visible in the name.
 */
export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Constrain `value` to the inclusive `[min, max]` range and round it to a
 * whole number. Use this for counts — retention limits, row caps, item counts.
 *
 * This exists as a separate name because it used to be a same-named copy of
 * `clampNumber` that silently rounded (query history's retention settings),
 * so two call sites reading `clampNumber(...)` behaved differently and neither
 * one said so. Rounding is applied before clamping, so the result is always a
 * whole number inside the range as long as the bounds are whole numbers.
 */
export function clampInt(value: number, min: number, max: number) {
  return clampNumber(Math.round(value), min, max);
}
