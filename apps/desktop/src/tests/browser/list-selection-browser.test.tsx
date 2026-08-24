import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";

/**
 * Hover and selection have to be told apart at a glance.
 *
 * In the connection list they were the same declaration — `:hover`,
 * `:focus-visible` and `.active` all painted `--selected` — so the row the
 * pointer happened to be over looked exactly like the connection you were on.
 * Elsewhere they were two tints three L* apart, which is a difference only a
 * colour picker can see.
 *
 * jsdom applies no stylesheet, so only a real engine can answer this. The
 * assertions are about what is painted: hover and selected differ in fill, and
 * the selected row carries an edge that hover never does.
 */

const mounted: Array<() => void> = [];

function mount(html: string) {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = html;
  document.body.append(shell);
  mounted.push(() => shell.remove());
  return shell;
}

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

describe("list selection vs hover (real stylesheet)", () => {
  it("paints the open connection differently from a resting row", () => {
    const shell = mount(`
      <aside class="connection-picker">
        <div class="connection-profile-list">
          <button class="connection-profile" data-role="resting"></button>
          <button class="connection-profile active" data-role="active"></button>
        </div>
      </aside>`);
    const resting = getComputedStyle(
      shell.querySelector<HTMLElement>('[data-role="resting"]')!,
    );
    const active = getComputedStyle(
      shell.querySelector<HTMLElement>('[data-role="active"]')!,
    );

    expect(active.backgroundColor).not.toBe(resting.backgroundColor);
    // The edge is the part a tint cannot be confused with.
    expect(active.boxShadow).not.toBe("none");
    expect(resting.boxShadow).toBe("none");
  });

  it("gives the sidebar's open connection an edge a hovered row has not", () => {
    const shell = mount(`
      <div class="sidebar">
        <button class="connection-item" data-role="resting"></button>
        <button class="connection-item active" data-role="active"></button>
      </div>`);
    const resting = getComputedStyle(
      shell.querySelector<HTMLElement>('[data-role="resting"]')!,
    );
    const active = getComputedStyle(
      shell.querySelector<HTMLElement>('[data-role="active"]')!,
    );

    expect(active.backgroundColor).not.toBe(resting.backgroundColor);
    expect(active.boxShadow).not.toBe("none");
    expect(resting.boxShadow).toBe("none");
  });
});
