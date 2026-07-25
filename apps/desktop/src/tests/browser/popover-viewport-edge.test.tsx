import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorTabStrip } from "@/app/EditorTabStrip";
import type { EditorTabStripProps } from "@/app/EditorTabStrip";
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
