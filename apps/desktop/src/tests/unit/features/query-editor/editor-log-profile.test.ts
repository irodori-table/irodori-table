import { describe, expect, it } from "vitest";
import { parseLogWithProfile } from "@/features/query-editor/editor-log-profile";

describe("structured log profiles (#177 tier 4)", () => {
  it("maps common multi-line entries to stable query columns", () => {
    const parsed = parseLogWithProfile(
      [
        "2026-08-16 10:00:00 INFO service started",
        "2026-08-16 10:00:01 ERROR request failed",
        "    at example.handler (handler.js:10)",
      ].join("\n"),
      "common",
    );

    expect(parsed.profileId).toBe("common");
    expect(parsed.columns).toEqual([
      "line",
      "end_line",
      "timestamp",
      "level",
      "message",
      "raw",
    ]);
    expect(parsed.rows).toEqual([
      [
        1,
        1,
        "2026-08-16 10:00:00",
        "INFO",
        "service started",
        "2026-08-16 10:00:00 INFO service started",
      ],
      [
        2,
        3,
        "2026-08-16 10:00:01",
        "ERROR",
        "request failed\n    at example.handler (handler.js:10)",
        "2026-08-16 10:00:01 ERROR request failed\n    at example.handler (handler.js:10)",
      ],
    ]);
  });

  it("normalizes severity aliases while retaining the complete raw entry", () => {
    const parsed = parseLogWithProfile(
      "[2026/08/16 10:00:00] WARNING: queue depth high",
      "common",
    );

    expect(parsed.rows[0]).toEqual([
      1,
      1,
      "2026/08/16 10:00:00",
      "WARN",
      "queue depth high",
      "[2026/08/16 10:00:00] WARNING: queue depth high",
    ]);
  });

  it("keeps unstructured non-empty lines independently queryable", () => {
    const parsed = parseLogWithProfile(
      "first raw line\n\nsecond raw line",
      "common",
    );

    expect(parsed.totalRows).toBe(2);
    expect(parsed.rows.map((row) => [row[0], row[4]])).toEqual([
      [1, "first raw line"],
      [3, "second raw line"],
    ]);
  });

  it("auto-detects JSON Lines and unions object columns", () => {
    const parsed = parseLogWithProfile(
      [
        '{"time":"10:00","level":"info","message":"started"}',
        '{"time":"10:01","level":"error","message":"failed","code":500}',
      ].join("\n"),
      "auto",
    );

    expect(parsed.profileId).toBe("jsonl");
    expect(parsed.columns).toEqual(["time", "level", "message", "code"]);
    expect(parsed.rows).toEqual([
      ["10:00", "info", "started", null],
      ["10:01", "error", "failed", 500],
    ]);
  });

  it("falls back to common text in auto mode but rejects explicit invalid JSON Lines", () => {
    const text = '{"message": "still being written"';

    expect(parseLogWithProfile(text, "auto")).toMatchObject({
      profileId: "common",
      totalRows: 1,
    });
    expect(() => parseLogWithProfile(text, "jsonl")).toThrow();
  });

  it("caps generated rows while reporting the complete entry count", () => {
    const parsed = parseLogWithProfile(
      ["one", "two", "three", "four"].join("\n"),
      "common",
      2,
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.totalRows).toBe(4);
    expect(parsed.truncated).toBe(true);
  });

  it("returns a stable empty schema for an empty common log", () => {
    const parsed = parseLogWithProfile("", "common");

    expect(parsed.columns).toHaveLength(6);
    expect(parsed.rows).toEqual([]);
    expect(parsed.totalRows).toBe(0);
    expect(parsed.truncated).toBe(false);
  });
});
