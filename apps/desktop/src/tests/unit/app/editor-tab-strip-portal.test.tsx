import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorTabStrip } from "@/app/EditorTabStrip";
import type { EditorTabStripProps } from "@/app/EditorTabStrip";
import { usePreferencesStore } from "@/features/preferences";
import { expectPortaledIntoViewport } from "@/tests/helpers/portal";
import { componentRenderer } from "@/tests/helpers/render";

/**
 * EditorTabStrip had no test at all (#172). Its tab context menu shipped an
 * off-screen bug (#115): rendered in place it positioned against the dock panel
 * instead of the window, so it appeared offset by the panel's left edge, and
 * with enough tabs open the "..." button sits far enough right that the menu
 * landed past the window edge entirely and nothing showed.
 *
 * The fix — portal to <body>, `position: fixed`, clamp to the viewport — is
 * `clampMenuToViewport` in EditorTabStrip.tsx. These assertions pin the
 * mechanism; `expectPortaledIntoViewport` documents what jsdom can and cannot
 * prove.
 */

// Mirrors the reserved box in EditorTabStrip.clampMenuToViewport.
const MENU_WIDTH = 220;
const MENU_HEIGHT = 240;

/** The strip subtree the menu must not be rendered inside. */
const CLIPPING_ANCESTOR = ".editor-tab-strip";

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

const renderStrip = componentRenderer(EditorTabStrip, () => ({
  group: "primary" as EditorTabStripProps["group"],
  state,
  menu: null,
  onSelectTab: vi.fn(),
  onOpenMenu: vi.fn(),
  onCloseMenu: vi.fn(),
  onNewTab: vi.fn(),
  onRenameTab: vi.fn(),
  onDuplicateTab: vi.fn(),
  onCloseTab: vi.fn(),
  onCloseOtherTabs: vi.fn(),
  onReopenClosedTab: vi.fn(),
}));

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("EditorTabStrip tab menu", () => {
  it("exposes only tabs inside the tablist", () => {
    renderStrip();

    const tablist = screen.getByRole("tablist", { name: "SQL editor tabs" });

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    // #142: the strip-level "+" and "..." actions must stay outside the
    // tablist, because a tablist may only expose tabs to assistive tech. The
    // per-tab close buttons are part of their tab and belong inside it.
    for (const name of ["New SQL tab", "Tab actions"]) {
      expect(tablist).not.toContainElement(
        screen.getByRole("button", { name }),
      );
    }
  });

  it("renders no menu until one is open for this group", () => {
    renderStrip();

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores a menu opened for the other editor group", () => {
    renderStrip({
      menu: { x: 100, y: 100, group: "secondary", tabId: "t1" },
    });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("portals the menu out of the strip and keeps it on screen", () => {
    renderStrip({ menu: { x: 320, y: 180, group: "primary", tabId: "t1" } });

    expectPortaledIntoViewport(screen.getByRole("menu"), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  // The shipped bug (#115): the "..." button ends up near the right edge once
  // several tabs are open, so an unclamped menu ran past the window.
  it("clamps a menu opened past the right and bottom edges", () => {
    renderStrip({
      menu: {
        x: window.innerWidth + 200,
        y: window.innerHeight + 200,
        group: "primary",
        tabId: "t1",
      },
    });

    expectPortaledIntoViewport(screen.getByRole("menu"), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  it("clamps a menu opened above and left of the viewport", () => {
    renderStrip({
      menu: { x: -400, y: -400, group: "primary", tabId: "t1" },
    });

    expectPortaledIntoViewport(screen.getByRole("menu"), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  it("runs the tab action the menu item names", async () => {
    const { user, props } = renderStrip({
      menu: { x: 320, y: 180, group: "primary", tabId: "t1" },
    });

    await user.click(screen.getByRole("menuitem", { name: /duplicate/i }));

    expect(props.onDuplicateTab).toHaveBeenCalledWith("primary", "t1");
  });
});
