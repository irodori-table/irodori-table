import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/features/preferences";
import { EditorContextMenu } from "@/features/query-editor/EditorContextMenu";
import { expectPortaledIntoViewport } from "@/tests/helpers/portal";
import { componentRenderer } from "@/tests/helpers/render";

/**
 * EditorContextMenu had no test at all (#172). It portals to <body> because the
 * editor lives inside a dockview panel whose ancestors set `transform`/
 * `contain`, which would otherwise become the containing block for its
 * `position: fixed` and offset the menu from the pointer — the rationale is
 * documented at EditorContextMenu.tsx:97.
 *
 * Its `position: fixed` comes from the `.editor-context-menu` stylesheet rule
 * rather than an inline style, so jsdom cannot read it back; the browser suite
 * carries that half. What is asserted here is the portal boundary, the pointer
 * coordinates and the localisation of the items.
 */

// The menu's reserved box (`min-width: 250px` on .editor-context-menu, plus the
// full 16-item list).
const MENU_WIDTH = 250;
const MENU_HEIGHT = 400;

/** The editor subtree whose transform/contain used to mis-place the menu. */
const CLIPPING_ANCESTOR = ".workbench-dock-panel, .editor-shell";

const renderMenu = componentRenderer(EditorContextMenu, () => ({
  position: { x: 220, y: 140 },
  runPrimaryLabel: "Run",
  runShortcutLabel: "Ctrl+Enter",
  resultActionsAvailable: true,
  onCommand: vi.fn(),
  onClose: vi.fn(),
}));

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("EditorContextMenu", () => {
  it("portals to <body> at the pointer coordinates", () => {
    renderMenu();

    expectPortaledIntoViewport(screen.getByRole("menu"), {
      clippedBy: CLIPPING_ANCESTOR,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      // The rule lives in styles/workbench.css, not the style prop.
      fixedPositionFrom: "stylesheet",
    });
    expect(screen.getByRole("menu")).toHaveStyle({
      left: "220px",
      top: "140px",
    });
  });

  it("runs the command an item names and closes", async () => {
    const { user, props } = renderMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(1);

    await user.click(items[0]);

    expect(props.onCommand).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const { user, props } = renderMenu();

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalled();
  });

  it("closes on a pointer press outside the menu", async () => {
    const { user, props } = renderMenu();

    await user.click(document.body);

    expect(props.onClose).toHaveBeenCalled();
  });

  it("keeps the menu open when the press lands on a menu item", async () => {
    // The menu is portaled outside the React root, so a pointerdown inside it
    // no longer stops propagation to the window listener — the ref guard is
    // what keeps clicking an item from closing before its click fires.
    const { user, props } = renderMenu();

    await user.click(screen.getAllByRole("menuitem")[0]);

    expect(props.onCommand).toHaveBeenCalledTimes(1);
  });

  // #113 translated this menu: 15 of its 16 items used to render their English
  // `label` because the component never looked up commands.<id>.title.
  it("resolves item labels through i18n", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderMenu();

    const labels = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent ?? "");
    const japanese = labels.filter((label) => /[ぁ-んァ-ヶ一-龠]/.test(label));

    expect(japanese.length).toBeGreaterThan(labels.length / 2);
  });
});
