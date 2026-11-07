import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QueryResultSet } from "@/generated/irodori-api";
import { buildChartResultModel } from "@/features/results/chart-result";
import { ChartResultView } from "@/features/results/components/ChartResultView";
import { usePreferencesStore } from "@/features/preferences";
import { renderUi } from "@/tests/helpers/render";

const result: QueryResultSet = {
  statementIndex: 0,
  statement: "select region, sales from orders",
  columns: ["region", "sales"],
  rows: [
    ["Tokyo", "1,200"],
    ["Osaka", 900],
  ],
  rowCount: 2n,
  elapsedMs: 42n,
  truncated: false,
};

const model = buildChartResultModel(result.columns, result.rows);

describe("chart view result metadata", () => {
  it("carries the result statistics and BI field list inside Chart", () => {
    usePreferencesStore.setState({ locale: "en" });
    renderUi(<ChartResultView model={model!} result={result} />);

    expect(screen.getByLabelText("Result summary")).toHaveTextContent("2 rows");
    expect(screen.getByLabelText("Result summary")).toHaveTextContent(
      "2 columns",
    );
    const fields = screen.getByLabelText("Result fields");
    expect(fields).toHaveTextContent("Fields");
    expect(fields).toHaveTextContent("region");
    expect(fields).toHaveTextContent("sales");
    expect(fields).toHaveTextContent("measure");
  });

  it("omits the metadata when no result is available", () => {
    usePreferencesStore.setState({ locale: "en" });
    renderUi(<ChartResultView model={model!} result={null} />);

    expect(screen.queryByLabelText("Result summary")).not.toBeInTheDocument();
  });
});
