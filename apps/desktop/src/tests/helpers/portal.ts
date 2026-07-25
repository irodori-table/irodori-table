import { expect } from "vitest";

export interface FloatingSize {
  /** Widest the popover is allowed to be, in CSS pixels. */
  width: number;
  /** Tallest the popover is allowed to be, in CSS pixels. */
  height: number;
}

/**
 * Which pair of inset properties the component sets.
 *
 * `topLeft` is the common case. `bottomRight` is for a popover anchored to a
 * control pinned near the bottom of the window (RunControl), which opens upward
 * and therefore declares `bottom`/`right` instead.
 */
export type FloatingAnchor = "topLeft" | "bottomRight";

/**
 * Where `position: fixed` comes from.
 *
 * `inline` means the component sets it in its `style` prop, so jsdom can read
 * it back. `stylesheet` means a CSS class supplies it — jsdom applies no
 * stylesheet, so there is nothing here to assert and only the browser suite can
 * prove it. Naming the source keeps that gap explicit instead of silently
 * skipping the check.
 */
export type FixedPositionSource = "inline" | "stylesheet";

export interface PortaledPopoverExpectation extends FloatingSize {
  /**
   * Selector for the ancestor whose `overflow`/`transform` would clip or
   * mis-place the popover if it were rendered in place instead of portaled.
   */
  clippedBy: string;
  anchor?: FloatingAnchor;
  fixedPositionFrom?: FixedPositionSource;
}

/**
 * Assert a popover escaped its clipping ancestor and is pinned inside the
 * viewport.
 *
 * What this can prove under jsdom:
 *  - the element is in the document and not `display:none`/`visibility:hidden`;
 *  - it is a child of <body>, i.e. it really went through `createPortal` and is
 *    no longer inside the subtree named by `clippedBy`;
 *  - it is `position: fixed` (when the component sets that inline), so a
 *    scrolled or transformed ancestor cannot drag it off-screen;
 *  - the coordinates it declares keep a box of `width`x`height` on screen.
 *
 * What it cannot prove: that the element is *painted*. jsdom applies no
 * stylesheet and lays nothing out, so `getBoundingClientRect()` is all zeros
 * and a real `overflow: hidden` clip is invisible to it. The portal-ancestry
 * check below is the stand-in: the popover must not live inside the container
 * that does the clipping. Genuine geometry belongs in the browser suite —
 * `src/tests/browser/popover-viewport-edge.test.tsx` is the outcome-level guard
 * these mechanism checks lean on (#172).
 */
export function expectPortaledIntoViewport(
  element: HTMLElement,
  {
    clippedBy,
    width,
    height,
    anchor = "topLeft",
    fixedPositionFrom = "inline",
  }: PortaledPopoverExpectation,
) {
  expect(element).toBeVisible();

  expect(
    element.closest(clippedBy),
    `popover is still inside ${clippedBy}; it must be portaled out of it`,
  ).toBeNull();
  expect(element.parentElement, "popover should be portaled to <body>").toBe(
    document.body,
  );

  if (fixedPositionFrom === "inline") {
    expect(
      element.style.position,
      "popover must be position:fixed so scrolled/transformed ancestors cannot move it",
    ).toBe("fixed");
  }

  // Both anchors describe the same thing: how far the box starts from an edge,
  // and whether its full extent still fits before the opposite edge.
  const insets =
    anchor === "topLeft"
      ? ([
          ["left", width, window.innerWidth],
          ["top", height, window.innerHeight],
        ] as const)
      : ([
          ["right", width, window.innerWidth],
          ["bottom", height, window.innerHeight],
        ] as const);

  for (const [edge, extent, viewport] of insets) {
    const value = Number.parseFloat(element.style[edge]);
    expect(Number.isFinite(value), `popover has no numeric ${edge}`).toBe(true);
    expect(
      value,
      `popover starts outside the viewport (${edge})`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      value + extent,
      `popover overflows the viewport measured from its ${edge} anchor`,
    ).toBeLessThanOrEqual(viewport);
  }
}
