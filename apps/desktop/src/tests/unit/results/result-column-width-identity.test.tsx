import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRID_COLUMN_WIDTH } from "@/app/app-workbench-utils";
import { useResultGridModel } from "@/app/controllers/use-result-grid-model";
import type { QueryResult, QueryResultSet } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";

const { t } = createTranslator("en");
const columns = ["description"];

function set(statement: string, rows: unknown[][]): QueryResultSet {
  return {
    statementIndex: 0,
    statement,
    columns,
    rows,
    rowCount: BigInt(rows.length),
    elapsedMs: 1n,
    truncated: false,
  };
}

function result(sets: QueryResultSet[]): QueryResult {
  const first = sets[0]!;
  return {
    columns: first.columns,
    rows: first.rows,
    rowCount: first.rowCount,
    elapsedMs: first.elapsedMs,
    truncated: false,
    resultSets: sets,
  };
}

const deps = {
  resultMode: "data" as const,
  tableViewObject: null,
  executedSql: "select description from t",
  editorEngine: "postgres" as const,
  activeMetadata: undefined,
  spillInfo: null,
  gridWindowVersion: 0,
  editMode: false,
  cellEdits: new Map(),
  newRows: [],
  deletedRows: new Set<number>(),
  filterRules: [],
  quickFilter: "",
  filterJoin: "and" as const,
  sortRules: [],
  selectedRowKey: null,
  gridGutterWidth: 40,
  gridGutterColumnWidth: 40,
  gridColumnWidth: GRID_COLUMN_WIDTH,
  gridScrollLeft: 0,
  gridViewportWidth: 800,
  gridScrollTop: 0,
  gridViewportHeight: 400,
  gridRowHeight: 27,
  t,
};

let latest: ReturnType<typeof useResultGridModel>;

function Harness({
  value,
  activeResultIndex = 0,
  executedSql = deps.executedSql,
}: {
  value: QueryResult;
  activeResultIndex?: number;
  executedSql?: string;
}) {
  latest = useResultGridModel({
    ...deps,
    executedSql,
    result: value,
    activeResultIndex,
  });
  return null;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("manual result column widths", () => {
  it("survives later snapshots of the same statement", () => {
    const first = result([set("select description from t", [["short"]])]);
    const { rerender } = render(<Harness value={first} />);

    act(() => latest.resizeColumn(0, 350));
    expect(latest.gridColumnWidths[0]).toBeCloseTo(350, 0);

    const nextBatch = result([
      set("select description from t", [["short"], ["another"]]),
    ]);
    rerender(<Harness value={nextBatch} />);
    expect(latest.gridColumnWidths[0]).toBeCloseTo(350, 0);
  });

  it("resets when the executed statement changes", () => {
    const first = result([set("select description from t", [["short"]])]);
    const { rerender } = render(<Harness value={first} />);
    act(() => latest.resizeColumn(0, 350));

    const newQuery = result([
      set("select description from other", [["short"]]),
    ]);
    rerender(
      <Harness value={newQuery} executedSql="select description from other" />,
    );
    expect(latest.gridColumnWidths[0]).not.toBeCloseTo(350, 0);
  });

  it("keeps result sets from one run independent", () => {
    const twoSets = result([
      result([set("select 1", [["a"]])]).resultSets![0]!,
      set("select 2", [["b"]]),
    ]);
    const { rerender } = render(<Harness value={twoSets} />);
    act(() => latest.resizeColumn(0, 350));
    expect(latest.gridColumnWidths[0]).toBeCloseTo(350, 0);

    rerender(<Harness value={twoSets} activeResultIndex={1} />);
    expect(latest.gridColumnWidths[0]).not.toBeCloseTo(350, 0);

    rerender(<Harness value={twoSets} activeResultIndex={0} />);
    expect(latest.gridColumnWidths[0]).toBeCloseTo(350, 0);
  });

  it("keeps the first width when streaming adds explicit result sets", () => {
    const executedSql = "select description from t; select description from u";
    const first = result([set("statement 1", [["short"]])]);
    delete first.resultSets;
    const { rerender } = render(
      <Harness value={first} executedSql={executedSql} />,
    );
    act(() => latest.resizeColumn(0, 350));

    const next = result([
      set("statement 1", [["short"], ["another"]]),
      { ...set("statement 2", [["other"]]), statementIndex: 1 },
    ]);
    rerender(<Harness value={next} executedSql={executedSql} />);
    expect(latest.gridColumnWidths[0]).toBe(350);

    rerender(
      <Harness value={next} executedSql={executedSql} activeResultIndex={1} />,
    );
    expect(latest.gridColumnWidths[0]).not.toBe(350);
    rerender(<Harness value={next} executedSql={executedSql} />);
    expect(latest.gridColumnWidths[0]).toBe(350);
  });
});
