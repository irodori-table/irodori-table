import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorTabStrip } from "@/app/EditorTabStrip";
import type { EditorTabStripProps } from "@/app/EditorTabStrip";
import { usePopoverPosition, type PopoverAnchor } from "@/components/popover";
import "@/App.css";

/**
 * The outcome-level guard the unit suite cannot provide (#172, item 3).
 *
 * jsdom does no layout: a menu rendered inside an `overflow: hidden` ancestor
 * at clipped coordinates still reads as "visible" to jest-dom, because
 * `getBoundingClientRect()` is all zeros and no stylesheet is applied. That is
 * exactly the blindness through which the clipped-popover (#114) and
 * off-screen-menu (#115) bugs shipped green.
 *
 * Here the real engine lays the page out with the real stylesheet, so the
 * assertions can be about pixels: the menu has a non-empty box, that box is
 * fully inside the viewport, and — the check that actually distinguishes
 * "present in the DOM" from "on screen" — the point at its centre hit-tests to
 * the menu itself rather than to whatever is painted over it.
 *
 * The unit tests pin the mechanism (portal target, position: fixed, clamp
 * maths); this pins the result.
 */

const state: EditorTabStripProps["state"] = {
  tabs: [
    { id: "t1", label: "scratch.sql" },
    { id: "t2", label: "report.sql" },
  ],
  activeTabId: "t1",
  openTabIds: ["t1", "t2"],
  queryByTabId: { t1: "select 1", t2: "select 2" },
  selectionsByTabId: {},
};

function stripProps(menu: EditorTabStripProps["menu"]): EditorTabStripProps {
  return {
    group: "primary" as EditorTabStripProps["group"],
    state,
    menu,
    onSelectTab: vi.fn(),
    onOpenMenu: vi.fn(),
    onCloseMenu: vi.fn(),
    onNewTab: vi.fn(),
    onRenameTab: vi.fn(),
    onDuplicateTab: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseOtherTabs: vi.fn(),
    onReopenClosedTab: vi.fn(),
  };
}

const mounted: Array<() => void> = [];

/**
 * Mount the strip inside a small `overflow: hidden` panel pinned to the bottom
 * right of the window — the real ancestry that did the clipping.
 */
function mountStripInClippingPanel(menu: EditorTabStripProps["menu"]) {
  const host = document.createElement("div");
  host.className = "workbench-dock-panel editor";
  Object.assign(host.style, {
    position: "fixed",
    right: "0px",
    bottom: "0px",
    width: "320px",
    height: "120px",
    overflow: "hidden",
  });
  document.body.append(host);

  // flushSync, not act(): the browser environment does not set
  // IS_REACT_ACT_ENVIRONMENT, and the sibling browser tests render the same way.
  const root = createRoot(host);
  flushSync(() => {
    root.render(<EditorTabStrip {...stripProps(menu)} />);
  });

  mounted.push(() => {
    flushSync(() => root.unmount());
    host.remove();
  });
  return host;
}

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

/** The deepest element painted at a point, walking into shadow roots. */
function hitTest(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

describe("popover viewport edge (real layout)", () => {
  it("paints the tab menu on screen when opened at the bottom-right corner", () => {
    // Past the corner on purpose: unclamped, this is the #115 failure.
    mountStripInClippingPanel({
      x: window.innerWidth - 4,
      y: window.innerHeight - 4,
      group: "primary",
      tabId: "t1",
    });

    const menu = document.querySelector<HTMLElement>(".editor-tab-menu");
    expect(menu, "tab menu should be portaled to <body>").not.toBeNull();
    expect(menu!.parentElement).toBe(document.body);

    const rect = menu!.getBoundingClientRect();

    // A real box, not the zero-sized rect jsdom always reports.
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);

    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);

    // The assertion jsdom can never make: something of the menu is genuinely
    // painted at its own centre. A clipped or covered menu fails here while
    // still passing every DOM-shape check.
    const centre = hitTest(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    expect(centre, "nothing is painted at the menu's centre").not.toBeNull();
    expect(menu!.contains(centre)).toBe(true);
  });

  it("paints the tab menu on screen when opened past the top-left corner", () => {
    mountStripInClippingPanel({
      x: -300,
      y: -300,
      group: "primary",
      tabId: "t1",
    });

    const menu = document.querySelector<HTMLElement>(".editor-tab-menu");
    const rect = menu!.getBoundingClientRect();

    expect(rect.width).toBeGreaterThan(0);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);

    const centre = hitTest(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    expect(menu!.contains(centre)).toBe(true);
  });

  it("escapes the clipping ancestor rather than being cut off by it", () => {
    const host = mountStripInClippingPanel({
      x: window.innerWidth - 4,
      y: window.innerHeight - 4,
      group: "primary",
      tabId: "t1",
    });

    const menu = document.querySelector<HTMLElement>(".editor-tab-menu");

    // The mechanism, restated in pixels: the menu is taller than the panel that
    // would have clipped it, so had it rendered in place it could not possibly
    // have been fully visible.
    expect(menu!.closest(".workbench-dock-panel")).toBeNull();
    expect(menu!.getBoundingClientRect().height).toBeGreaterThan(
      host.getBoundingClientRect().height,
    );
  });
});

/**
 * The anchored path, exercised directly against the primitive (#168).
 *
 * The surfaces that hang a menu off a button used to fake right-alignment by
 * subtracting a hardcoded width from the control's right edge — `rect.right -
 * 218` in the sidebar, `- 190` for the create menu, a reserved 260 in
 * RunControl. Whenever the real menu was wider than the guess it overhung the
 * control; whenever it was narrower it floated away from it. Only real layout
 * can tell those apart, so the check belongs here rather than in jsdom.
 */
function AnchoredMenu({
  anchor,
  width,
}: {
  anchor: PopoverAnchor;
  width: number;
}) {
  const menu = usePopoverPosition<HTMLDivElement>(anchor);
  return (
    <div
      className="app-menu-popover anchored-probe"
      role="menu"
      ref={menu.ref}
      style={{ ...menu.style, minWidth: width, width }}
    >
      <button type="button" role="menuitem">
        <span>Item</span>
      </button>
    </div>
  );
}

function mountAnchored(anchor: PopoverAnchor, width: number) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => {
    root.render(<AnchoredMenu anchor={anchor} width={width} />);
  });
  mounted.push(() => {
    flushSync(() => root.unmount());
    host.remove();
  });
  return document.querySelector<HTMLElement>(".anchored-probe")!;
}

describe("anchored popover (real layout)", () => {
  it("right-aligns with its control using the menu's real width", () => {
    const control = { top: 300, bottom: 328, left: 600, right: 640 };

    for (const width of [180, 320]) {
      const menu = mountAnchored(
        { at: "element", rect: control, align: "end" },
        width,
      );
      const rect = menu.getBoundingClientRect();

      // The point of measuring: whatever the menu's width turns out to be, its
      // right edge lands on the control's. A guessed width cannot do this for
      // both sizes at once.
      expect(Math.round(rect.right)).toBe(control.right);
      expect(rect.left).toBeGreaterThanOrEqual(0);
      mounted.pop()?.();
    }
  });

  it("stacks above its control by the menu's real height", () => {
    const control = { top: 600, bottom: 628, left: 400, right: 460 };
    const menu = mountAnchored(
      { at: "element", rect: control, side: "above" },
      240,
    );
    const rect = menu.getBoundingClientRect();

    expect(rect.bottom).toBeLessThan(control.top);
    expect(rect.top).toBeGreaterThanOrEqual(0);
  });

  it("keeps an end-aligned menu on screen when its control hugs the left edge", () => {
    // Right-aligning against a control at x=0 computes a negative left; this is
    // the mirror of #115 that RunControl shipped.
    const menu = mountAnchored(
      {
        at: "element",
        rect: { top: 300, bottom: 328, left: 0, right: 40 },
        align: "end",
      },
      320,
    );
    const rect = menu.getBoundingClientRect();

    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    const centre = hitTest(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    expect(menu.contains(centre)).toBe(true);
  });
});
