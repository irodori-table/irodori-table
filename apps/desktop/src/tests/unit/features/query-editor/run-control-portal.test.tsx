import { screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/features/preferences";
import { RunControl } from "@/features/query-editor/RunControl";
import { stubPopoverSize } from "@/tests/helpers/popover";
import { expectPortaledIntoViewport } from "@/tests/helpers/portal";
import { renderUi } from "@/tests/helpers/render";

/**
 * RunControl had no test at all (#172), despite being one of the components
 * whose clipping bug actually shipped: the run menu sits inside
 * `.workbench-dock-panel.editor`, which is `overflow: hidden`, so rendered in
 * place it opened correctly by every DOM measure — `aria-expanded` true,
 * opacity 1 — while the panel clipped every pixel and the button looked dead
 * (#114). The fix is documented at RunControl.tsx.
 *
 * This one opens *upward*, because the control is pinned to the bottom of the
 * editor pane, and right-aligns with it. Since #168 that comes from the shared
 * popover primitive: the menu element itself is placed at a clamped
 * `left`/`top`, replacing a zero-size `.run-menu-portal` wrapper that was
 * positioned with `bottom`/`right` while stylesheet rules placed the real menu
 * relative to it — so the box the clamp reserved was never the box on screen.
 */

/** The box the menu occupies once laid out; jsdom lays nothing out. */
const MENU_WIDTH = 260;
const MENU_HEIGHT = 200;

/** The dock panel whose overflow used to swallow the menu. */
const CLIPPING_ANCESTOR = ".workbench-dock-panel";

/**
 * jsdom lays nothing out, so `getBoundingClientRect()` is all zeros and every
 * anchor would read as the top-left corner. Stub a rect so the coordinate maths
 * under test gets realistic input.
 */
function stubAnchorRect(rect: { top: number; right: number }) {
  // Only the control's rect: the primitive measures the *menu* through
  // offsetWidth/offsetHeight, which `stubPopoverSize` supplies separately.
  vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
    ...new DOMRect(),
    top: rect.top,
    right: rect.right,
    bottom: rect.top + 28,
    left: rect.right - 120,
    width: 120,
    height: 28,
  } as DOMRect);
}

function Harness({ startOpen = false }: { startOpen?: boolean }) {
  const [runMenuOpen, setRunMenuOpen] = useState(startOpen);
  const runControlRef = useRef<HTMLDivElement>(null);
  return (
    // Mirrors the real ancestry: the control lives inside the clipping panel.
    <div className="workbench-dock-panel editor" style={{ overflow: "hidden" }}>
      <RunControl
        running={false}
        runControlRef={runControlRef}
        runMenuOpen={runMenuOpen}
        setRunMenuOpen={setRunMenuOpen}
        runPrimaryLabel="Run"
        runShortcutLabel="Ctrl+Enter"
        runCurrentShortcutLabel="Ctrl+Shift+Enter"
        runFromStartShortcutLabel="Ctrl+Alt+Enter"
        runAllShortcutLabel="Ctrl+Alt+A"
        hasSelectedEditorSql={false}
        runQuery={vi.fn().mockResolvedValue(undefined)}
        runSelectionQuery={vi.fn().mockResolvedValue(undefined)}
        runCurrentQuery={vi.fn().mockResolvedValue(undefined)}
        runFromStartQuery={vi.fn().mockResolvedValue(undefined)}
        runAllQuery={vi.fn().mockResolvedValue(undefined)}
      />
    </div>
  );
}

/** The menu is now the positioned element itself, with no wrapper. */
function openMenuPortal(): HTMLElement {
  return screen.getByRole("menu");
}

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
  stubPopoverSize(".run-menu-popover", {
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RunControl run menu", () => {
  it("stays closed until the toggle is pressed", () => {
    renderUi(<Harness />);

    expect(screen.getByRole("button", { name: "Run options" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("portals the menu out of the clipping dock panel and keeps it on screen", async () => {
    stubAnchorRect({ top: 700, right: 980 });
    const { user } = renderUi(<Harness />);

    await user.click(screen.getByRole("button", { name: "Run options" }));

    expectPortaledIntoViewport(openMenuPortal(), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  // The mirror of the tab-strip bug (#115): anchoring on `right` means a
  // control near the left edge yields a huge right inset, which pushes the menu
  // off the *left* side of the window. RunControl had no clamp at all before
  // #172, so this case rendered a menu nobody could see.
  it("clamps the menu on screen when the control sits near the left edge", async () => {
    stubAnchorRect({ top: 700, right: 130 });
    const { user } = renderUi(<Harness />);

    await user.click(screen.getByRole("button", { name: "Run options" }));

    expectPortaledIntoViewport(openMenuPortal(), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  it("clamps the menu on screen when the control sits near the top edge", async () => {
    stubAnchorRect({ top: 20, right: 980 });
    const { user } = renderUi(<Harness />);

    await user.click(screen.getByRole("button", { name: "Run options" }));

    expectPortaledIntoViewport(openMenuPortal(), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  it("offers the run variants and disables selection-run without a selection", async () => {
    stubAnchorRect({ top: 700, right: 980 });
    const { user } = renderUi(<Harness />);

    await user.click(screen.getByRole("button", { name: "Run options" }));

    expect(
      screen.getByRole("menuitem", { name: "Run Selection" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(1);
  });

  it("closes on a pointer press outside the control", async () => {
    stubAnchorRect({ top: 700, right: 980 });
    const { user } = renderUi(<Harness />);
    await user.click(screen.getByRole("button", { name: "Run options" }));
    expect(screen.getByRole("menu")).toBeVisible();

    await user.click(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
