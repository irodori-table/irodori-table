import { describe, expect, it } from "vitest";
import {
  measureResultColumnWidths,
  resultColumnOffsets,
  resultColumnWindow,
} from "@/features/results/result-column-widths";

const fixedMeasure = (text: string) => text.length * 10;

describe("measureResultColumnWidths", () => {
  it("fits the header and formatted cells with bounded padding", () => {
    const widths = measureResultColumnWidths(
      ["id", "created_at"],
      [
        [1, "2026-11-07T09:32:00Z"],
        [2, "2026-11-07T09:33:00Z"],
      ],
      fixedMeasure,
    );
    // Headers add the structural padding and content adds numeric padding.
    expect(widths[0]).toBeGreaterThanOrEqual(80);
    expect(widths[1]).toBeGreaterThan(widths[0]!);
    expect(widths[1]).toBeLessThanOrEqual(720);
  });

  it("caps unusually long values instead of measuring unbounded text", () => {
    const widths = measureResultColumnWidths(
      ["payload"],
      [["x".repeat(5_000)]],
      fixedMeasure,
    );
    expect(widths[0]).toBeLessThanOrEqual(720);
  });

  it("samples only the first rows of a large result", () => {
    let calls = 0;
    const rows = Array.from({ length: 1_000 }, (_, index) => [index]);
    // Past the sample window the header alone decides the width.
    measureResultColumnWidths(["n"], rows, (text, header) => {
      if (!header) calls += 1;
      return fixedMeasure(text);
    });
    expect(calls).toBe(200);
  });

  it("scales with UI zoom", () => {
    const base = measureResultColumnWidths(["name"], [["abc"]], fixedMeasure);
    const zoomed = measureResultColumnWidths(
      ["name"],
      [["abc"]],
      (text) => fixedMeasure(text) * 2,
      2,
    );
    expect(zoomed[0]).toBeCloseTo(base[0]! * 2, 0);
  });
});

describe("resultColumnOffsets", () => {
  it("starts at zero and accumulates each width", () => {
    expect(resultColumnOffsets([100, 40, 60])).toEqual([0, 100, 140, 200]);
    expect(resultColumnOffsets([])).toEqual([0]);
  });
});

describe("resultColumnWindow", () => {
  const offsets = resultColumnOffsets([100, 100, 100, 100]);

  it("returns only the columns inside the viewport", () => {
    const window = resultColumnWindow(offsets, 0, 150, 0);
    expect(window.firstColumnIndex).toBe(0);
    expect(window.lastColumnIndex).toBe(2);
    expect(window.leftPadPx).toBe(0);
    expect(window.rightPadPx).toBe(200);
  });

  it("uses offsets so a scrolled window matches variable widths", () => {
    const window = resultColumnWindow(
      resultColumnOffsets([40, 300, 40]),
      40,
      300,
      0,
    );
    // Scrolling past the narrow first column drops it and pads by its width.
    expect(window.firstColumnIndex).toBe(1);
    expect(window.lastColumnIndex).toBe(2);
    expect(window.leftPadPx).toBe(40);
    expect(window.rightPadPx).toBe(40);
  });

  it("adds overscan around the visible range and clamps to the ends", () => {
    const window = resultColumnWindow(offsets, 0, 100, 1);
    expect(window.firstColumnIndex).toBe(0);
    expect(window.lastColumnIndex).toBe(2);

    const end = resultColumnWindow(offsets, 300, 100, 1);
    expect(end.firstColumnIndex).toBe(2);
    expect(end.lastColumnIndex).toBe(4);
    expect(end.rightPadPx).toBe(0);
  });

  it("returns an empty window when there are no columns", () => {
    expect(resultColumnWindow([0], 0, 100, 0)).toEqual({
      firstColumnIndex: 0,
      lastColumnIndex: 0,
      leftPadPx: 0,
      rightPadPx: 0,
    });
  });
});
