import type { TranslationKey } from "@/i18n";

/**
 * Engines whose connector is known to return results that are wrong rather
 * than absent, and which therefore must say so at connect time (#117).
 *
 * Silently incorrect results are the worst failure mode a database client has:
 * the user gets an answer, no error, and no reason to re-check it. A connector
 * that cannot be correct yet is still more useful than none — but only if it
 * is loud about the gap, so this is a warning on a *successful* connection, not
 * a failure.
 *
 * Entries are removed as the connectors are fixed. Hudi and Delta were removed
 * once their extensions started resolving the table snapshot properly
 * (irodori-extension-hudi#6, irodori-extension-delta-lake#6); Hive still
 * reduces every table to a bare `read_parquet` glob and is tracked in
 * irodori-extension-hive#6.
 */
export type EngineCorrectnessWarning = {
  /** Short headline for the connect-time notice. */
  readonly titleKey: TranslationKey;
  /** What is wrong and what the user should do about it. */
  readonly detailKey: TranslationKey;
};

const engineCorrectnessWarnings: Readonly<
  Record<string, EngineCorrectnessWarning>
> = {
  hive: {
    titleKey: "notice.connection.correctness.hive.title",
    detailKey: "notice.connection.correctness.hive.detail",
  },
};

/**
 * The correctness warning for an engine, or null when the connector has no
 * known result-integrity gap.
 */
export function engineCorrectnessWarning(
  engine: string | null | undefined,
): EngineCorrectnessWarning | null {
  if (!engine) {
    return null;
  }
  return engineCorrectnessWarnings[engine.trim().toLowerCase()] ?? null;
}

/** Engine ids that currently carry a warning. Exported for the catalog check. */
export function enginesWithCorrectnessWarnings(): readonly string[] {
  return Object.keys(engineCorrectnessWarnings);
}
