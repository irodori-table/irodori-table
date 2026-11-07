import { describe, expect, it } from "vitest";
import {
  collectSqlProblems,
  filterSqlProblems,
  isSqlBufferTab,
  positionAt,
  problemCounts,
  type SqlProblemTab,
} from "@/features/problems/sql-problems";

const sqlTab = (
  text: string,
  overrides: Partial<SqlProblemTab> = {},
): SqlProblemTab => ({
  key: "primary:scratch",
  group: "primary",
  tabId: "scratch",
  label: "scratch.sql",
  text,
  ...overrides,
});

describe("positionAt", () => {
  it("reports 1-based line and column from an offset", () => {
    const text = "select 1\nfrom (";
    expect(positionAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt(text, 7)).toEqual({ line: 1, column: 8 });
    expect(positionAt(text, 9)).toEqual({ line: 2, column: 1 });
    expect(positionAt(text, 14)).toEqual({ line: 2, column: 6 });
  });
});

describe("collectSqlProblems", () => {
  it("reports an unclosed parenthesis with its location", () => {
    const problems = collectSqlProblems(
      [sqlTab("select (1")],
      "postgres",
      "gentle",
    );
    const problem = problems.find((item) =>
      item.message.includes("Unclosed opening parenthesis"),
    );
    expect(problem).toMatchObject({
      severity: "error",
      line: 1,
      column: 8,
      label: "scratch.sql",
      tabId: "scratch",
    });
  });

  it("excludes table tabs", () => {
    expect(isSqlBufferTab("table:public.users")).toBe(false);
    expect(
      collectSqlProblems(
        [sqlTab("select (1", { tabId: "table:public.users" })],
        "postgres",
        "gentle",
      ),
    ).toEqual([]);
  });

  it("runs no scan when the linter is disabled", () => {
    expect(
      collectSqlProblems([sqlTab("select (1")], "postgres", "disabled"),
    ).toEqual([]);
  });

  it("skips blank buffers", () => {
    expect(
      collectSqlProblems([sqlTab("   \n  ")], "postgres", "gentle"),
    ).toEqual([]);
  });

  it("sorts problems into error and warning counts", () => {
    const problems = collectSqlProblems(
      [sqlTab("select (1")],
      "postgres",
      "gentle",
    );
    const counts = problemCounts(problems);
    expect(counts.errors).toBeGreaterThan(0);
    expect(counts.total).toBe(problems.length);
  });
});

describe("filterSqlProblems", () => {
  const problems = collectSqlProblems(
    [sqlTab("select (1")],
    "postgres",
    "gentle",
  );

  it("matches message, file, severity, and line", () => {
    expect(filterSqlProblems(problems, "parenthesis")).toEqual(problems);
    expect(filterSqlProblems(problems, "scratch")).toEqual(problems);
    expect(filterSqlProblems(problems, "error")).toEqual(problems);
    expect(filterSqlProblems(problems, "1:8")).toEqual(problems);
  });

  it("normalizes full-width input and requires every term", () => {
    expect(filterSqlProblems(problems, "ＥＲＲＯＲ scratch")).toEqual(problems);
    expect(filterSqlProblems(problems, "error nope")).toEqual([]);
  });

  it("returns everything for a blank query", () => {
    expect(filterSqlProblems(problems, "  ")).toEqual(problems);
  });
});
