import type { ComponentProps } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/App.css";
import { RowDetailSidebar } from "@/features/results/components/RowDetailSidebar";

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

function host(width: number, html = "") {
  const element = document.createElement("div");
  Object.assign(element.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${width}px`,
  });
  element.innerHTML = html;
  document.body.append(element);
  mounted.push(() => element.remove());
  return element;
}

/** The markup SidebarObjectBrowser renders for a column row. */
function columnRow(width: number, name: string, type: string) {
  const element = host(
    width,
    `<button class="metadata-row field-row" type="button">
       <span class="field-row-text"><span>${name}</span><small>${type}</small></span>
     </button>`,
  );
  const row = element.querySelector<HTMLElement>(".field-row")!;
  return {
    row,
    name: element.querySelector<HTMLElement>(".field-row-text > span")!,
    type: element.querySelector<HTMLElement>(".field-row-text > small")!,
  };
}

function isClippedBelow(type: HTMLElement, row: HTMLElement) {
  return type.getBoundingClientRect().top >= row.getBoundingClientRect().bottom;
}

describe("column rows in the object tree (real layout)", () => {
  it("shows the type beside the name when both fit", () => {
    const { row, name, type } = columnRow(240, "id", "uuid");

    expect(isClippedBelow(type, row)).toBe(false);
    expect(type.getBoundingClientRect().top).toBeCloseTo(
      name.getBoundingClientRect().top,
      0,
    );
    expect(type.getBoundingClientRect().left).toBeGreaterThan(
      name.getBoundingClientRect().right,
    );
  });

  it("hides the type rather than shortening the name when they collide", () => {
    const { row, name, type } = columnRow(
      150,
      "embedding_vector",
      "USER-DEFINED",
    );

    expect(isClippedBelow(type, row)).toBe(true);
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
  });

  it("shortens a name that does not fit even alone, on one line", () => {
    const { row, name } = columnRow(
      90,
      "a_column_name_longer_than_any_sidebar",
      "text",
    );

    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.getBoundingClientRect().right,
    );
    expect(row.getBoundingClientRect().height).toBeLessThan(24);
  });
});

describe("object tree disclosure and scrolling (real layout)", () => {
  it("turns the chevron only for the row that is open", () => {
    const element = host(
      240,
      `<details class="object-tree" open>
         <summary><svg class="tree-chevron" id="open-row"></svg></summary>
         <details class="object-tree">
           <summary><svg class="tree-chevron" id="closed-row"></svg></summary>
         </details>
       </details>`,
    );
    const transform = (id: string) =>
      getComputedStyle(element.querySelector(`#${id}`)!).transform;

    expect(transform("open-row")).not.toBe("none");
    expect(transform("closed-row")).toBe("none");
  });

  it("gives the sidebar panel a permanent scrollbar", () => {
    const element = host(
      200,
      `<div class="sidebar-panel" style="height: 100px">
         <div style="height: 400px"></div>
       </div>`,
    );
    const panel = element.querySelector<HTMLElement>(".sidebar-panel")!;

    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
    // Declared rather than measured: Playwright starts Chromium with its
    // scrollbars hidden, so they take up no room there whatever the CSS says.
    expect(getComputedStyle(panel, "::-webkit-scrollbar").width).toBe("8px");
  });
});

const table = {
  schema: "public",
  name: "t",
  kind: "table",
  columns: [
    {
      name: "a_column_name_longer_than_the_panel",
      dataType: "timestamp with time zone and more",
      nullable: true,
    },
  ],
  foreignKeys: [],
  indexes: [],
} as unknown as ComponentProps<typeof RowDetailSidebar>["table"] & object;

describe("row detail field cards (real layout)", () => {
  function renderCard(width: number) {
    const element = host(width);
    const root = createRoot(element);
    mounted.push(() => root.unmount());
    flushSync(() =>
      root.render(
        <RowDetailSidebar
          columns={["a_column_name_longer_than_the_panel"]}
          values={["value"]}
          table={table}
          metadata={{ schemas: [{ name: "public", objects: [table] }] }}
          engine="postgres"
          connectionId="c1"
          onClose={vi.fn()}
        />,
      ),
    );
    return {
      name: element.querySelector<HTMLElement>(".detail-col")!,
      type: element.querySelector<HTMLElement>(".detail-type")!,
      copy: element.querySelector<HTMLElement>(".detail-copy")!,
    };
  }

  it("keeps the name on one shortened line with the type below it", () => {
    const { name, type, copy } = renderCard(130);
    const lineHeight = (node: HTMLElement) =>
      Number.parseFloat(getComputedStyle(node).fontSize) * 2;

    expect(name.getBoundingClientRect().height).toBeLessThan(lineHeight(name));
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(getComputedStyle(name).textOverflow).toBe("ellipsis");
    expect(type.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      name.getBoundingClientRect().bottom - 1,
    );
    expect(type.getBoundingClientRect().height).toBeLessThan(lineHeight(type));
    expect(copy.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      name.getBoundingClientRect().right,
    );
  });

  it("keeps the full text in a tooltip", () => {
    const { name, type } = renderCard(130);

    expect(name.title).toBe("a_column_name_longer_than_the_panel");
    expect(type.title).toBe("timestamp with time zone and more");
  });
});

describe("row detail view switcher (real layout)", () => {
  function renderSwitcher(width: number, values: unknown[]) {
    const element = host(width);
    const root = createRoot(element);
    mounted.push(() => root.unmount());
    flushSync(() =>
      root.render(
        <RowDetailSidebar
          columns={["doc"]}
          values={values}
          table={null}
          metadata={undefined}
          engine="postgres"
          connectionId="c1"
          onClose={vi.fn()}
        />,
      ),
    );
    return element;
  }
  const tabs = (element: HTMLElement) =>
    [...element.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);

  it("offers Tree only when a value has structure", () => {
    expect(tabs(renderSwitcher(400, ["flat"]))).toEqual(["Fields", "JSON"]);
    expect(tabs(renderSwitcher(400, [{ a: 1 }]))).toEqual([
      "Fields",
      "JSON",
      "Tree",
    ]);
  });

  it("folds the other views into a menu instead of overflowing", async () => {
    const element = renderSwitcher(150, [{ a: 1 }]);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(tabs(element)).toEqual(["Fields"]);
    const more = element.querySelector<HTMLElement>(".row-detail-more")!;
    const host = element.querySelector<HTMLElement>(".row-detail-tabs-host")!;
    expect(more.getBoundingClientRect().right).toBeLessThanOrEqual(
      host.getBoundingClientRect().right + 1,
    );
    const tab = element.querySelector<HTMLElement>('[role="tab"]')!;
    expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth);
  });

  it("sizes unequal labels to their content instead of equal columns", async () => {
    // Between "the whole set fits" and "the widest label fits its equal
    // share" the old 1fr columns truncated Fields. Every width where all three
    // tabs stay visible must keep every label inside its own tab.
    for (const width of [150, 160, 170, 180, 200]) {
      const element = renderSwitcher(width, [{ a: 1 }]);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const visibleTabs = [
        ...element.querySelectorAll<HTMLElement>('[role="tab"]'),
      ];
      if (visibleTabs.length !== 3) {
        continue;
      }
      for (const tab of visibleTabs) {
        expect(
          tab.scrollWidth,
          `${width}px: ${tab.textContent}`,
        ).toBeLessThanOrEqual(tab.clientWidth + 1);
      }
    }
  });

  it("shows Copy as an icon that still has a name", () => {
    const element = renderSwitcher(400, ["flat"]);
    const copy = element.querySelector<HTMLElement>(".row-detail-copy")!;

    expect(copy.textContent).toBe("");
    expect(copy.getAttribute("aria-label")).toBe("Copy JSON");
    expect(copy.title).toBe("Copy JSON");
  });
});
