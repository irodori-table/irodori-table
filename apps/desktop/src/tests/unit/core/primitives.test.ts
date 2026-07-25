import { describe, expect, it } from "vitest";
import { clampInt, clampNumber, isRecord, resolveValue } from "@/core";

// These three primitives had 12, 7 and 6 copies scattered across features/
// before #167 pulled them into core/. Two of the copy families had silently
// diverged, so the point of these tests is less "does clamping work" than
// "which behaviour did we standardise on".
describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("rejects null, arrays and primitives", () => {
    // Five of the pre-#167 copies omitted the array check while their own
    // error messages said "must be an object", so a JSON array reached parsers
    // that immediately read string keys off it and saw undefined everywhere.
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(3)).toBe(false);
  });
});

describe("clampNumber", () => {
  it("constrains to the inclusive range", () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(11, 0, 10)).toBe(10);
    expect(clampNumber(0, 0, 10)).toBe(0);
    expect(clampNumber(10, 0, 10)).toBe(10);
  });

  it("preserves fractional input", () => {
    // The distinguishing behaviour: the query-history copy used to round under
    // this same name, so identical-looking call sites behaved differently.
    expect(clampNumber(2.5, 0, 10)).toBe(2.5);
    expect(clampNumber(0.4, 0, 10)).toBe(0.4);
  });
});

describe("clampInt", () => {
  it("rounds and constrains", () => {
    expect(clampInt(2.5, 0, 10)).toBe(3);
    expect(clampInt(2.4, 0, 10)).toBe(2);
    expect(clampInt(-0.6, 0, 10)).toBe(0);
    expect(clampInt(10.6, 0, 10)).toBe(10);
  });

  it("rounds before clamping so the result stays whole inside the range", () => {
    expect(clampInt(9.7, 0, 10)).toBe(10);
    expect(clampInt(0.5, 1, 10)).toBe(1);
  });
});

describe("resolveValue", () => {
  it("returns a direct value unchanged", () => {
    expect(resolveValue(1, 2)).toBe(2);
    expect(resolveValue("a", "b")).toBe("b");
    expect(resolveValue(true, false)).toBe(false);
  });

  it("applies an updater function against the current value", () => {
    expect(resolveValue(1, (current) => current + 1)).toBe(2);
    expect(
      resolveValue<string[]>(["a"], (current) => [...current, "b"]),
    ).toEqual(["a", "b"]);
  });

  it("treats null and undefined as direct values, not updaters", () => {
    expect(resolveValue<string | null>("a", null)).toBeNull();
    expect(resolveValue<number | undefined>(1, undefined)).toBeUndefined();
  });
});
