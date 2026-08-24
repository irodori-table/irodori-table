import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";

/**
 * The sidebar toggles are icons, not buttons with a chrome of their own.
 *
 * The pressed state used to be a filled, bordered, accent-edged box around the
 * glyph — and the glyph already says the same thing, since its panel side
 * fills when that sidebar is open. Two statements of one fact, the louder of
 * them a frame in a titlebar that has no other frames in it.
 *
 * jsdom applies no stylesheet, so only a real engine can tell whether a rule
 * paints. These assertions are about what is painted: the resting and pressed
 * toggles carry no background, no border and no inset edge, and the pressed
 * one is still distinguishable — by color alone.
 *
 * The markup mirrors WorkbenchShell's titlebar control zone; the class names
 * are the contract between it and the stylesheet.
 */

const mounted: Array<() => void> = [];

function mountTitlebar() {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = `
    <header class="titlebar">
      <div class="titlebar-control-zone">
        <button
          class="icon-button layout-toggle-button active sidebar-left"
          type="button"
          data-sidebar-toggle="left"
        ></button>
        <button
          class="icon-button layout-toggle-button sidebar-right"
          type="button"
          data-sidebar-toggle="right"
        ></button>
      </div>
    </header>`;
  document.body.append(shell);
  mounted.push(() => shell.remove());

  return {
    open: shell.querySelector<HTMLElement>('[data-sidebar-toggle="left"]')!,
    closed: shell.querySelector<HTMLElement>('[data-sidebar-toggle="right"]')!,
  };
}

const TRANSPARENT = new Set(["transparent", "rgba(0, 0, 0, 0)"]);

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

describe("titlebar sidebar toggles (real stylesheet)", () => {
  it("paints no frame around the toggle whose sidebar is open", () => {
    const { open } = mountTitlebar();
    const style = getComputedStyle(open);

    expect(TRANSPARENT.has(style.backgroundColor)).toBe(true);
    expect(TRANSPARENT.has(style.borderTopColor)).toBe(true);
    expect(TRANSPARENT.has(style.borderLeftColor)).toBe(true);
    expect(style.boxShadow).toBe("none");
  });

  it("paints no frame around the toggle whose sidebar is closed either", () => {
    const { closed } = mountTitlebar();
    const style = getComputedStyle(closed);

    expect(TRANSPARENT.has(style.backgroundColor)).toBe(true);
    expect(TRANSPARENT.has(style.borderTopColor)).toBe(true);
    expect(style.boxShadow).toBe("none");
  });

  it("still tells the two apart, by the color of the icon", () => {
    const { open, closed } = mountTitlebar();

    expect(getComputedStyle(open).color).not.toBe(
      getComputedStyle(closed).color,
    );
  });
});
