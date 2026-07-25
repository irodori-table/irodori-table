import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyLogMarks,
  loadLogMarks,
  logMarkCount,
  logMarksEqual,
  logMarksStorageKey,
  pruneLogMarks,
  saveLogMarks,
  sortedLogMarkLines,
  toggleLogMark,
  type LogMarks,
} from "@/features/query-editor/editor-log-marks";

/**
 * Line marking for log buffers (#177 tier 3). Filtering narrows by rule;
 * marking is the manual counterpart, so the model has to survive the things a
 * log does between sessions — being reopened, and being truncated.
 */

beforeEach(() => {
  window.localStorage.clear();
});

describe("toggleLogMark", () => {
  it("adds, recolours, and clears with one gesture", () => {
    let marks: LogMarks = emptyLogMarks;

    marks = toggleLogMark(marks, 12, "amber");
    expect(marks).toEqual({ 12: "amber" });

    // Same line, different colour -> recolour rather than a second mark.
    marks = toggleLogMark(marks, 12, "red");
    expect(marks).toEqual({ 12: "red" });

    // Same line, same colour -> clear.
    marks = toggleLogMark(marks, 12, "red");
    expect(marks).toEqual({});
  });

  it("keeps other lines untouched", () => {
    const marks = toggleLogMark(
      toggleLogMark(emptyLogMarks, 3, "green"),
      9,
      "blue",
    );

    expect(sortedLogMarkLines(marks)).toEqual([3, 9]);
    expect(logMarkCount(marks)).toBe(2);
  });

  it("ignores line numbers that cannot exist", () => {
    expect(toggleLogMark(emptyLogMarks, 0, "amber")).toEqual({});
    expect(toggleLogMark(emptyLogMarks, -4, "amber")).toEqual({});
    expect(toggleLogMark(emptyLogMarks, 1.5, "amber")).toEqual({});
  });

  it("does not mutate the input", () => {
    const original: LogMarks = { 5: "amber" };
    toggleLogMark(original, 6, "blue");

    expect(original).toEqual({ 5: "amber" });
  });
});

describe("sortedLogMarkLines", () => {
  it("returns file order, not insertion or string order", () => {
    let marks: LogMarks = emptyLogMarks;
    for (const line of [100, 9, 21, 3]) {
      marks = toggleLogMark(marks, line, "amber");
    }

    // Object keys sort as strings, which would give 100 before 21.
    expect(sortedLogMarkLines(marks)).toEqual([3, 9, 21, 100]);
  });
});

describe("pruneLogMarks", () => {
  // A log re-read after truncation or rotation is shorter than when it was
  // marked; a mark past the end would render nowhere yet still list.
  it("drops marks past the end of a shortened document", () => {
    const marks: LogMarks = { 2: "amber", 40: "red", 900: "blue" };

    expect(pruneLogMarks(marks, 50)).toEqual({ 2: "amber", 40: "red" });
  });

  it("keeps a mark on the final line", () => {
    expect(pruneLogMarks({ 50: "green" }, 50)).toEqual({ 50: "green" });
  });
});

describe("logMarksEqual", () => {
  it("compares lines and colours, not object identity", () => {
    expect(logMarksEqual({ 1: "amber" }, { 1: "amber" })).toBe(true);
    expect(logMarksEqual({ 1: "amber" }, { 1: "red" })).toBe(false);
    expect(logMarksEqual({ 1: "amber" }, { 2: "amber" })).toBe(false);
    expect(logMarksEqual({ 1: "amber" }, {})).toBe(false);
  });
});

describe("mark persistence", () => {
  it("round-trips marks for a file", () => {
    saveLogMarks("app.log", { 4: "amber", 88: "red" });

    expect(loadLogMarks("app.log")).toEqual({ 4: "amber", 88: "red" });
  });

  it("keeps files separate", () => {
    saveLogMarks("app.log", { 1: "amber" });
    saveLogMarks("worker.log", { 2: "blue" });

    expect(loadLogMarks("app.log")).toEqual({ 1: "amber" });
    expect(loadLogMarks("worker.log")).toEqual({ 2: "blue" });
  });

  it("removes the entry rather than storing an empty object", () => {
    saveLogMarks("app.log", { 1: "amber" });
    saveLogMarks("app.log", emptyLogMarks);

    expect(
      window.localStorage.getItem(logMarksStorageKey("app.log")),
    ).toBeNull();
    expect(loadLogMarks("app.log")).toEqual({});
  });

  it("returns nothing for an unknown file", () => {
    expect(loadLogMarks("never-seen.log")).toEqual({});
  });

  // Stored marks are user data from a previous version; a corrupt or
  // hand-edited entry must not break opening the file.
  it("survives malformed stored data", () => {
    window.localStorage.setItem(logMarksStorageKey("app.log"), "not json");
    expect(loadLogMarks("app.log")).toEqual({});

    window.localStorage.setItem(logMarksStorageKey("app.log"), "[1,2,3]");
    expect(loadLogMarks("app.log")).toEqual({});

    window.localStorage.setItem(
      logMarksStorageKey("app.log"),
      JSON.stringify({ 3: "chartreuse", 4: "green", zero: "red" }),
    );
    expect(loadLogMarks("app.log")).toEqual({ 4: "green" });
  });

  it("ignores an empty file key rather than writing a global entry", () => {
    saveLogMarks("", { 1: "amber" });

    expect(window.localStorage.length).toBe(0);
    expect(loadLogMarks("")).toEqual({});
  });
});
