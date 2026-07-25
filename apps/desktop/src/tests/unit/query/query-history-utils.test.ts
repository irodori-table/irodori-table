import { describe, expect, it } from "vitest";
import {
  formatHistoryDateTime,
  formatHistoryOutcome,
  formatHistoryTime,
} from "@/features/query-history/query-history-utils";
import type { QueryHistoryItem } from "@/features/query-history/query-history-store";
import { createTranslator } from "@/i18n";

// History timestamps rendered month/day only and always in the OS locale
// (#121): a January entry viewed the next year looked current, and the app
// language setting was ignored. The formatters now take the app locale and add
// the year for entries from previous years.

// Midday UTC so no timezone can shift the calendar date across a year edge.
const ranAt = "2023-03-05T12:00:00Z";

const { t: tEn } = createTranslator("en");
const { t: tJa } = createTranslator("ja");

describe("query history time formatting", () => {
  it("adds the year to entries from previous years", () => {
    expect(
      formatHistoryDateTime(ranAt, tEn, "en", new Date("2026-07-01T12:00:00Z")),
    ).toContain("2023");
    expect(
      formatHistoryDateTime(ranAt, tEn, "en", new Date("2023-07-01T12:00:00Z")),
    ).not.toContain("2023");
  });

  it("formats in the app locale rather than the OS locale", () => {
    const now = new Date("2026-07-01T12:00:00Z");
    expect(formatHistoryDateTime(ranAt, tJa, "ja", now)).not.toBe(
      formatHistoryDateTime(ranAt, tEn, "en-US", now),
    );
    expect(formatHistoryTime(ranAt, "ja")).not.toBe(
      formatHistoryTime(ranAt, "en-US"),
    );
  });

  it("keeps the invalid-timestamp fallbacks", () => {
    expect(formatHistoryDateTime("not a date", tEn, "en")).toBe("Unknown time");
    expect(formatHistoryDateTime("not a date", tJa, "ja")).toBe("日時不明");
    expect(formatHistoryTime("not a date", "en")).toBe("--:--");
  });
});

// The outcome chip renders on every history row, so leaving it in English made
// it the most-repeated untranslated string in the app (#135).
describe("query history outcome chip", () => {
  const baseItem = {
    id: "1",
    sql: "select 1",
    ranAt,
    status: "ok",
    rowCount: 1234,
    elapsedMs: 42,
    truncated: false,
    connectionId: "c1",
    connectionName: "local",
    engine: "duckdb",
  } as unknown as QueryHistoryItem;

  it("translates the row and elapsed labels", () => {
    expect(formatHistoryOutcome(baseItem, tEn, "en")).toBe(
      "1,234 rows · 42 ms",
    );
    expect(formatHistoryOutcome(baseItem, tJa, "ja")).toBe("1,234 行 · 42 ms");
  });

  it("marks a capped result", () => {
    const capped = { ...baseItem, truncated: true } as QueryHistoryItem;

    expect(formatHistoryOutcome(capped, tEn, "en")).toContain("capped");
    expect(formatHistoryOutcome(capped, tJa, "ja")).toContain("上限到達");
  });

  it("translates the bare failure label but keeps a driver message verbatim", () => {
    const failed = {
      ...baseItem,
      status: "error",
      error: undefined,
    } as unknown as QueryHistoryItem;
    const withMessage = {
      ...failed,
      error: "syntax error at or near SELCT",
    } as unknown as QueryHistoryItem;

    expect(formatHistoryOutcome(failed, tJa, "ja")).toBe("失敗");
    expect(formatHistoryOutcome(withMessage, tJa, "ja")).toBe(
      "syntax error at or near SELCT",
    );
  });
});
