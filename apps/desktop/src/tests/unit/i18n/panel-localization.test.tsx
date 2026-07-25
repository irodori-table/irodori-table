import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BiPanel } from "@/features/results/components/BiPanel";
import { PlanPanel } from "@/features/workbench/components/PlanPanel";
import { buildBiResultSummary } from "@/features/results/bi-result";
import { usePreferencesStore } from "@/features/preferences";
import type { QueryResultSet } from "@/generated/irodori-api";
import { renderUi } from "@/tests/helpers/render";

/**
 * #170: BiPanel, LakehousePanel and PlanPanel contained no `t()` call at all,
 * so they rendered in English under any language setting. The sibling scan
 * (`untranslated-surfaces.test.ts`) proves each file now reaches i18n; this
 * proves the strings actually follow the locale, which a scan cannot.
 */

beforeEach(() => {
  usePreferencesStore.setState({ locale: "ja" });
});

const result: QueryResultSet = {
  statementIndex: 0,
  statement: "select 1",
  columns: ["id", "name"],
  rows: [[1, "Ada"]],
  rowCount: 1234n,
  elapsedMs: 42n,
  truncated: false,
};

describe("panels render in the active locale", () => {
  it("BiPanel translates its chrome and empty state", () => {
    renderUi(
      <BiPanel
        result={null}
        chartModel={null}
        chartAvailable={false}
        onOpenChartMode={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "BI を閉じる" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("有効な結果がありません").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("No active result")).not.toBeInTheDocument();
  });

  it("PlanPanel translates its actions and empty state", () => {
    renderUi(
      <PlanPanel
        plan={null}
        loading={false}
        error={null}
        activeConnectionOpen={false}
        activeConnectionName="local"
        onExplainPlan={vi.fn()}
        onExplainAnalyze={vi.fn()}
        onCopyFormat={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "実行計画を閉じる" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("実行計画を見るには接続してください。"),
    ).toBeVisible();
    expect(
      screen.queryByText("Connect to inspect execution plans."),
    ).not.toBeInTheDocument();
  });

  it("falls back to English when the locale is en", () => {
    usePreferencesStore.setState({ locale: "en" });
    renderUi(
      <PlanPanel
        plan={null}
        loading={false}
        error={null}
        activeConnectionOpen={false}
        activeConnectionName="local"
        onExplainPlan={vi.fn()}
        onExplainAnalyze={vi.fn()}
        onCopyFormat={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Connect to inspect execution plans."),
    ).toBeVisible();
  });
});

// The BI labels come from a non-component module that takes the locale, so its
// numbers and its words have to follow the same setting — before #170 only the
// numbers did.
describe("BI summary labels follow the locale", () => {
  it("translates the words around the formatted numbers", () => {
    const ja = buildBiResultSummary(result, null, "ja");
    const en = buildBiResultSummary(result, null, "en");

    expect(ja?.rowCountLabel).toBe("1,234 行");
    expect(en?.rowCountLabel).toBe("1,234 rows");
    expect(ja?.statusLabel).toBe("現在の結果");
    expect(en?.statusLabel).toBe("current result");
  });

  it("marks a truncated result in both languages", () => {
    const truncated = { ...result, truncated: true };

    expect(buildBiResultSummary(truncated, null, "ja")?.statusLabel).toBe(
      "打ち切られた結果",
    );
    expect(buildBiResultSummary(truncated, null, "en")?.statusLabel).toBe(
      "truncated result",
    );
  });
});
