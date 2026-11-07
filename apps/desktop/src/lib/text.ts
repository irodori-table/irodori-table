/** Shorten to `maxLength` characters, ending in `...` when anything was cut. */
export function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

/** A non-blank string from untrusted data, or `undefined`. */
export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** A non-blank string from untrusted data, or `fallback`. */
export function stringOr(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}
