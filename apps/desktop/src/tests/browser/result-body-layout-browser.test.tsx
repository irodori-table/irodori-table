import { type ComponentProps, createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";
import { ResultBody } from "@/features/results/components/ResultBody";
import type { ResultGridDisplayRow } from "@/features/results/result-view-model";
import type { DbObjectMetadata } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";
import { cssVariables, darkTheme, lightTheme } from "@/theme";

type ResultBodyProps = ComponentProps<typeof ResultBody>;

const { t } = createTranslator("en");
const noop = () => {};
const ROW_HEIGHT = 27;
const COLUMN_WIDTH = 148;
const GUTTER_WIDTH = 34;

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

function mountPane(
  width: number,
  height: number,
  theme: "light" | "dark" = "light",
) {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.dataset.theme = theme;
  Object.assign(shell.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${width}px`,
    height: `${height}px`,
    display: "flex",
  });
  for (const [name, value] of Object.entries(
    cssVariables(theme === "dark" ? darkTheme : lightTheme),
  )) {
    shell.style.setProperty(name, value);
  }
  const pane = document.createElement("section");
  pane.className = "results-pane";
  pane.style.flex = "1";
  shell.append(pane);
  document.body.append(shell);
  const root = createRoot(pane);
  mounted.push(() => {
    root.unmount();
    shell.remove();
  });
  return {
    pane,
    render: (props: ResultBodyProps) =>
      flushSync(() => root.render(<ResultBody {...props} />)),
  };
}

function resultBodyProps(
  overrides: Partial<ResultBodyProps> = {},
): ResultBodyProps {
  return {
    structureObject: null,
    resultMode: "data",
    chartModel: null,
    graphModel: null,
    formatObjectName: (object) => `${object.schema}.${object.name}`,
    formatCount: String,
    editMode: false,
    running: false,
    hasResult: true,
    filtersActive: false,
    unfilteredRowCount: 0,
    totalRows: 0,
    resultColumns: [],
    gridRef: createRef<HTMLDivElement>(),
    gridRowStyle: {},
    gridTotalWidth: 1,
    gridRowHeight: ROW_HEIGHT,
    gridColumnWidth: COLUMN_WIDTH,
    leftColumnPad: 0,
    rightColumnPad: 0,
    topPad: 0,
    bottomPad: 0,
    firstVisible: 0,
    visibleColumnIndexes: [],
    visibleRows: [],
    visibleRowsRevision: 0,
    sortRuleByColumn: new Map(),
    sortRules: [],
    selectedRowKey: null,
    selectedCell: null,
    selectedRangeBounds: null,
    editingCell: null,
    cellEdits: new Map(),
    onGridScroll: noop,
    onGridKeyDown: noop,
    onGridPaste: noop,
    onGridCopy: noop,
    onToggleSort: noop,
    onSelectGridRow: noop,
    onSelectGridCell: noop,
    onBeginCellEdit: noop,
    onSetCellValue: noop,
    onDeleteRow: noop,
    onPasteTableAt: noop,
    onEndCellEdit: noop,
    shortcutTips: [],
    t,
    ...overrides,
  };
}

function editModeGridProps(): ResultBodyProps {
  const columns = Array.from({ length: 8 }, (_, index) => `col_${index}`);
  const states: ResultGridDisplayRow["state"][] = ["clean", "edited", "new"];
  const rows = Array.from({ length: 16 }, (_, index): ResultGridDisplayRow => ({
    key: `o${index}`,
    origin: { kind: "orig", index },
    cells: columns.map((_, col) => `6${index}3-7${col}-long-value`),
    state: states[index % states.length]!,
  }));
  const totalWidth = GUTTER_WIDTH + columns.length * COLUMN_WIDTH;
  return resultBodyProps({
    editMode: true,
    resultColumns: columns,
    totalRows: rows.length,
    unfilteredRowCount: rows.length,
    visibleRows: rows,
    visibleColumnIndexes: columns.map((_, index) => index),
    selectedRowKey: "o4",
    gridTotalWidth: totalWidth,
    gridRowStyle: {
      gridTemplateColumns: [
        `${GUTTER_WIDTH}px`,
        ...columns.map(() => `${COLUMN_WIDTH}px`),
      ].join(" "),
      minWidth: totalWidth,
      width: totalWidth,
    },
  });
}

function colorAlpha(color: string) {
  // Computed colours serialise as rgb(r, g, b), rgba(r, g, b, a) or
  // color(space c1 c2 c3 / a); only the last two carry an alpha.
  const alpha =
    color.match(/^rgba\(.*,\s*([\d.]+)\)$/)?.[1] ??
    color.match(/\/\s*([\d.]+)\)$/)?.[1];
  return alpha === undefined ? 1 : Number(alpha);
}

/**
 * In edit mode a sticky gutter of row-delete buttons pins to the grid's left
 * edge, and cells scroll underneath it. It used to paint transparent (the
 * `.delete-row` reset beat its background), so cell text showed through the
 * x, and it sat above the sticky header, so body-row buttons slid over the
 * header cell while scrolling down.
 */
describe("edit-mode row gutter (real layout)", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`paints every row's gutter opaque in the row's tint (${theme})`, () => {
      const { render } = mountPane(640, 320, theme);
      const props = editModeGridProps();
      render(props);

      const rows =
        props.gridRef.current!.querySelectorAll<HTMLElement>(".grid-row");
      expect(rows.length).toBeGreaterThan(4);
      for (const row of rows) {
        const gutter = row.querySelector<HTMLElement>(".grid-gutter")!;
        const style = getComputedStyle(gutter);
        expect(colorAlpha(style.backgroundColor)).toBe(1);
        if (!row.classList.contains("header")) {
          expect(style.backgroundImage).toContain(
            getComputedStyle(row).backgroundColor,
          );
        }
      }
    });
  }

  it("keeps body-row gutters underneath the sticky header", () => {
    const { pane, render } = mountPane(640, 320);
    const props = editModeGridProps();
    render(props);
    const grid = props.gridRef.current!;
    grid.scrollTop = ROW_HEIGHT + 13;

    const gridBox = grid.getBoundingClientRect();
    const hit = document.elementFromPoint(
      gridBox.left + GUTTER_WIDTH / 2,
      gridBox.top + ROW_HEIGHT / 2,
    );
    expect(pane.contains(hit)).toBe(true);
    expect(hit?.closest(".grid-row")?.classList.contains("header")).toBe(true);
  });
});

const structure: DbObjectMetadata = {
  schema: "public",
  name: "customer_orders",
  kind: "table",
  rowEstimate: 12_345n,
  primaryKey: ["id"],
  indexes: [
    {
      name: "customer_orders_customer_id_created_at_idx",
      columns: ["customer_id", "created_at"],
      unique: false,
    },
  ],
  foreignKeys: [],
  columns: [
    ["id", "bigint", false, "nextval('customer_orders_id_seq'::regclass)"],
    ["customer_id", "bigint", false],
    ["created_at", "timestamp with time zone", false, "now()"],
    ["status", "character varying(32)", true, "'pending'::character varying"],
    ["total_amount_including_tax", "numeric(12,2)", true],
    ["notes", "text", true, undefined, "Free-form notes left by the customer"],
  ].map(([name, dataType, nullable, defaultValue, comment], index) => ({
    name: name as string,
    dataType: dataType as string,
    nullable: nullable as boolean,
    ordinal: index + 1,
    defaultValue: defaultValue as string | undefined,
    comment: comment as string | undefined,
  })),
};

/**
 * The structure view used a fixed two-column grid, so the side cards kept at
 * least 260px and the columns table got whatever was left: in a mid-width
 * pane it was clipped after Name and Type, with the rest behind a scrollbar
 * at the bottom of an otherwise empty box.
 */
describe("structure view (real layout)", () => {
  function renderStructure(width: number, object = structure) {
    const { pane, render } = mountPane(width, 360);
    render(resultBodyProps({ structureObject: object }));
    const box = (selector: string) =>
      pane.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    return {
      wrap: pane.querySelector<HTMLElement>(".structure-table-wrap")!,
      section: box(".structure-section"),
      side: box(".structure-side"),
      view: box(".structure-view"),
    };
  }

  it("drops the side cards below the table when the pane is narrow", () => {
    const { wrap, section, side } = renderStructure(760);

    expect(side.top).toBeGreaterThanOrEqual(section.bottom);
    // Every column, through Comment, fits without sideways scrolling.
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth);
  });

  it("keeps the side cards beside an unclipped table in a wide pane", () => {
    const { wrap, section, side } = renderStructure(1100);

    expect(side.left).toBeGreaterThanOrEqual(section.right);
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth);
  });

  it("scrolls a long table inside its own box", () => {
    const { wrap, section, view } = renderStructure(760, {
      ...structure,
      columns: Array.from({ length: 40 }, (_, index) => ({
        name: `column_${index}`,
        dataType: "integer",
        nullable: true,
        ordinal: index + 1,
      })),
    });

    expect(wrap.scrollHeight).toBeGreaterThan(wrap.clientHeight);
    expect(section.bottom).toBeLessThanOrEqual(view.bottom);
  });
});
