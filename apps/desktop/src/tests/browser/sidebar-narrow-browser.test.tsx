import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";
import "@/features/search/search-replace.css";

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

/**
 * The search panel has to narrow with the sidebar, not hang out of it.
 *
 * `.search-field` is a grid item, and a grid item's `min-width` defaults to
 * `auto` — its min-content width, which for this box is an input's intrinsic
 * ~20 characters plus three toggle buttons. In a sidebar at its 180px minimum
 * the field kept that width and the panel edge clipped it.
 */
describe("search panel in a narrow sidebar (real layout)", () => {
  function mountSearchPanel(width: number) {
    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: `${width}px`,
      overflow: "hidden",
    });
    host.innerHTML = `
      <aside class="sidebar"><section class="search-panel">
        <div class="search-inputs">
          <button class="search-replace-expand"></button>
          <div class="search-fields">
            <div class="search-field">
              <input placeholder="Search across all tabs" />
              <div class="search-toggles">
                <button>Aa</button><button>ab</button><button>.*</button>
              </div>
            </div>
          </div>
        </div>
      </section></aside>`;
    document.body.append(host);
    mounted.push(() => host.remove());
    return host;
  }

  for (const width of [180, 140]) {
    it(`keeps the field inside a ${width}px sidebar`, () => {
      const host = mountSearchPanel(width);
      const field = host.querySelector<HTMLElement>(".search-field")!;
      const input = host.querySelector<HTMLInputElement>("input")!;

      expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(
        width + 1,
      );
      expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(
        width + 1,
      );
      // Shrunk, not hidden: the toggles are still on screen beside it.
      const toggles = host.querySelector<HTMLElement>(".search-toggles")!;
      expect(toggles.getBoundingClientRect().width).toBeGreaterThan(0);
    });
  }
});
