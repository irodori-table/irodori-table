import { afterEach } from "vitest";

/**
 * Give a popover a box to be measured, under an environment that has none.
 *
 * `usePopoverPosition` clamps against the popover's *measured* size rather than
 * a hardcoded guess (#168) — that is the whole point of the primitive, because
 * the guesses drifted out of sync with the CSS. jsdom performs no layout, so
 * every element there measures 0x0 and the clamp has nothing to pull back.
 *
 * A unit test that wants to assert the clamp therefore has to supply the size
 * the browser would have computed. Patch it onto the popover only, matched by
 * selector: other elements keep their real (zero) rects, which matters because
 * anchor-positioned menus read `getBoundingClientRect()` off the *control* to
 * decide where to open, and a global stub would silently move the anchor too.
 *
 * The real geometry guard remains `src/tests/browser/popover-viewport-edge.
 * test.tsx`, where the engine does the layout and no stub is involved.
 */
export function stubPopoverSize(
  selector: string,
  size: { width: number; height: number },
): void {
  // The primitive measures `offsetWidth`/`offsetHeight` (layout metrics, immune
  // to the pop-in scale animation), so those are what a stub has to provide.
  const metrics = [
    ["offsetWidth", size.width],
    ["offsetHeight", size.height],
  ] as const;

  for (const [property, value] of metrics) {
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      property,
    );
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        if (this.matches(selector)) {
          return value;
        }
        return original?.get ? original.get.call(this) : 0;
      },
    });
    afterEach(() => {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, property, original);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
          property
        ];
      }
    });
  }
}
