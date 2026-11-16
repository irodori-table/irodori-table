import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";

/**
 * Dialogs (connection manager, settings, ...) render beside `.app-shell`, not
 * inside it, so they only see the theme tokens declared on `.app-root`. The
 * accent family used to be derived inside `.app-shell` alone: in a dialog
 * `--accent` was unset, a primary button's color-mix went invalid and its fill
 * fell to transparent, while dark themes still set its label to ink. The
 * connection dialog's Connect button disappeared into the dark surface.
 *
 * jsdom applies no stylesheet, so only a real engine can answer this.
 */

const mounted: Array<() => void> = [];

// A dark palette in the shape AppWorkbench writes inline onto `.app-root`:
// base colors only, nothing derived.
const darkPalette = {
  "--border": "#3c4542",
  "--surface": "#1b2421",
  "--surface-raised": "#2c3532",
  "--surface-muted": "#151d1a",
  "--text": "#dae1de",
  "--muted": "#9aa6a2",
  "--teal": "#54c3ca",
  "--blue": "#7fb2e7",
  "--green": "#84c190",
};

function mountDialog(html: string) {
  const root = document.createElement("div");
  root.className = "app-root";
  root.dataset.theme = "dark";
  for (const [name, value] of Object.entries(darkPalette)) {
    root.style.setProperty(name, value);
  }
  // A sibling of the shell, the way WorkbenchRoot renders WorkbenchDialogs.
  root.innerHTML = `<div class="app-shell" data-theme="dark"></div>${html}`;
  document.body.append(root);
  mounted.push(() => root.remove());
  return root;
}

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

describe("dialog accent outside the shell (real stylesheet)", () => {
  it("fills a dialog's primary action instead of leaving it transparent", () => {
    const root = mountDialog(`
      <form class="connection-form">
        <div class="dialog-footer">
          <button class="primary-action" type="submit">Connect</button>
        </div>
      </form>`);
    const button = root.querySelector<HTMLButtonElement>(".primary-action")!;
    const style = getComputedStyle(button);

    expect(getComputedStyle(root).getPropertyValue("--accent")).not.toBe("");
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    // The ink label is only legible on the accent fill, never on the surface.
    expect(style.color).toBe("rgb(14, 26, 23)");
  });

  it("keeps the remember-password checkbox on one line with its caption", () => {
    const root = mountDialog(`
      <form class="connection-form">
        <div class="connection-form-body">
          <label class="connection-remember-password full-row">
            <input type="checkbox" checked />
            <span>Remember password</span>
          </label>
        </div>
      </form>`);
    const label = root.querySelector<HTMLLabelElement>(
      ".connection-remember-password",
    )!;
    const box = label.querySelector("input")!.getBoundingClientRect();
    const caption = label.querySelector("span")!.getBoundingClientRect();

    expect(getComputedStyle(label).display).toBe("flex");
    expect(getComputedStyle(label).textTransform).toBe("none");
    expect(box.height).toBeLessThanOrEqual(16);
    // Side by side: the caption starts to the right of the box, on its row.
    expect(caption.left).toBeGreaterThan(box.right);
    expect(
      Math.abs(caption.top + caption.height / 2 - (box.top + box.height / 2)),
    ).toBeLessThan(6);
  });
});
