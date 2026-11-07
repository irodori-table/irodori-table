import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProblemsPanel } from "@/features/problems/ProblemsPanel";
import type { SqlProblem } from "@/features/problems/sql-problems";
import { createTranslator } from "@/i18n";
import { renderUi } from "@/tests/helpers/render";

const { t } = createTranslator("en");

const problem: SqlProblem = {
  id: "primary:scratch:7:8:Unclosed",
  tabKey: "primary:scratch",
  group: "primary",
  tabId: "scratch",
  label: "scratch.sql",
  text: "select (1",
  from: 7,
  to: 8,
  line: 1,
  column: 8,
  severity: "error",
  message: "Unclosed opening parenthesis.",
};

describe("ProblemsPanel", () => {
  it("lists severity, message, file, and location", () => {
    renderUi(
      <ProblemsPanel
        problems={[problem]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        t={t}
      />,
    );

    expect(screen.getByText("Unclosed opening parenthesis.")).toBeVisible();
    expect(screen.getByText("scratch.sql:1:8")).toBeVisible();
    expect(screen.getByText(/Errors: 1/)).toBeVisible();
  });

  it("opens the selected problem", async () => {
    const onOpen = vi.fn();
    const { user } = renderUi(
      <ProblemsPanel
        problems={[problem]}
        onOpen={onOpen}
        onClose={vi.fn()}
        t={t}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Unclosed opening parenthesis/ }),
    );
    expect(onOpen).toHaveBeenCalledWith(problem);
  });

  it("filters the list and shows no-match feedback", async () => {
    const { user } = renderUi(
      <ProblemsPanel
        problems={[problem]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        t={t}
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Filter problems" }),
      "nope",
    );
    expect(screen.getByText("No problems match the filter.")).toBeVisible();
  });

  it("shows an empty state when there are no problems", () => {
    renderUi(
      <ProblemsPanel problems={[]} onOpen={vi.fn()} onClose={vi.fn()} t={t} />,
    );
    expect(screen.getByText("No problems in the open SQL tabs.")).toBeVisible();
  });
});
