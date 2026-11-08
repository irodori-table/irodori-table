import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";
import type { QueryResultSet } from "@/generated/irodori-api";
import { buildChartResultModel } from "@/features/results/chart-result";
import { ChartResultView } from "@/features/results/components/ChartResultView";

const columns = Array.from({ length: 12 }, (_, index) => `metric_${index}`);
const rows = Array.from({ length: 3 }, (_, row) =>
  columns.map((_, column) => (row + 1) * (column + 1)),
);
const model = buildChartResultModel(columns, rows);
const result: QueryResultSet = {
  statementIndex: 0,
  statement: "select * from metrics",
  columns,
  rows,
  rowCount: 3n,
  elapsedMs: 4n,
  truncated: false,
};

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function mountChart(width: number, height: number) {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${width}px`,
    height: `${height}px`,
  });
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<ChartResultView model={model} result={result} />),
  );
  cleanups.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

function height(host: HTMLElement, selector: string) {
  return (
    host.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ??
    0
  );
}

describe("Chart with metadata in a short result pane (real layout)", () => {
  it("keeps a usable plot at 760x280", () => {
    const host = mountChart(760, 280);

    expect(height(host, ".chart-result-canvas")).toBeGreaterThanOrEqual(100);
    expect(height(host, ".chart-result-meta")).toBeGreaterThan(0);
  });

  it("keeps a usable plot with the metadata stacked at a narrow width", () => {
    const host = mountChart(420, 280);

    expect(height(host, ".chart-result-canvas")).toBeGreaterThanOrEqual(100);
    expect(height(host, ".chart-result-meta")).toBeGreaterThan(0);
  });
});
