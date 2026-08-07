// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  clampPopoverToViewport,
  popoverAnchorGap,
  popoverPosition,
  popoverPreferredPosition,
  popoverViewportMargin,
} from "@/components/popover";

/**
 * The positioning maths behind every portaled menu (#168). Five hand-written
 * copies of this used to live in the components; the bugs they shipped (#114,
 * #115, #124) were all "the popover left the viewport", so these cases are
 * written as edges of the window rather than as component scenarios.
 */

const viewport = { width: 1000, height: 800 };
const size = { width: 240, height: 160 };

describe("preferred position", () => {
  it("opens a context menu at the pointer", () => {
    expect(
      popoverPreferredPosition({ at: "pointer", x: 120, y: 90 }, size),
    ).toEqual({ left: 120, top: 90 });
  });

  it("hangs an anchored menu below the control, left edges aligned", () => {
    const rect = { top: 100, bottom: 130, left: 400, right: 500 };

    expect(popoverPreferredPosition({ at: "element", rect }, size)).toEqual({
      left: 400,
      top: 130 + popoverAnchorGap,
    });
  });

  it("right-aligns an `end`-aligned menu with its control", () => {
    // The menu is wider than the button it hangs off, so aligning the right
    // edges is the only way it stays visually attached.
    const rect = { top: 100, bottom: 130, left: 460, right: 500 };

    expect(
      popoverPreferredPosition({ at: "element", rect, align: "end" }, size),
    ).toEqual({ left: 500 - size.width, top: 130 + popoverAnchorGap });
  });

  it("stacks an `above` menu on top of its control using the measured height", () => {
    // RunControl is pinned to the bottom of the editor pane and opens upward.
    // With a guessed height this is where the menu drifted off the top.
    const rect = { top: 700, bottom: 730, left: 400, right: 500 };

    expect(
      popoverPreferredPosition({ at: "element", rect, side: "above" }, size),
    ).toEqual({ left: 400, top: 700 - size.height - popoverAnchorGap });
  });

  it("honours an explicit gap", () => {
    const rect = { top: 100, bottom: 130, left: 400, right: 500 };

    expect(
      popoverPreferredPosition({ at: "element", rect, gap: 12 }, size),
    ).toEqual({ left: 400, top: 142 });
  });
});

describe("viewport clamp", () => {
  it("leaves a popover that already fits untouched", () => {
    expect(
      clampPopoverToViewport({ left: 300, top: 200 }, size, viewport),
    ).toEqual({ left: 300, top: 200 });
  });

  it("pulls a popover back from the right and bottom edges", () => {
    // #115: the tab strip's "..." button sits near the right edge once several
    // tabs are open, and the menu ran past the window.
    expect(
      clampPopoverToViewport({ left: 990, top: 790 }, size, viewport),
    ).toEqual({
      left: viewport.width - size.width - popoverViewportMargin,
      top: viewport.height - size.height - popoverViewportMargin,
    });
  });

  it("pushes a popover back from the top and left edges", () => {
    expect(
      clampPopoverToViewport({ left: -300, top: -300 }, size, viewport),
    ).toEqual({ left: popoverViewportMargin, top: popoverViewportMargin });
  });

  it("keeps the near edge when the popover is larger than the viewport", () => {
    // No position fits. Pinning to the near edge clips the *bottom* of the
    // menu; the alternative clips the top, which is where the first item and
    // the keyboard focus start.
    const huge = { width: 1400, height: 1200 };

    expect(
      clampPopoverToViewport({ left: 300, top: 200 }, huge, viewport),
    ).toEqual({ left: popoverViewportMargin, top: popoverViewportMargin });
  });

  it("clamps against the real size, so a wider popover is pulled further in", () => {
    // The bug the measured size removes: every old clamp hardcoded a width
    // (218/220/238/270). Guess low and the menu still overflows by the
    // difference, with no error anywhere.
    const narrow = clampPopoverToViewport(
      { left: 900, top: 100 },
      { width: 200, height: 160 },
      viewport,
    );
    const wide = clampPopoverToViewport(
      { left: 900, top: 100 },
      { width: 320, height: 160 },
      viewport,
    );

    expect(narrow.left).toBe(1000 - 200 - popoverViewportMargin);
    expect(wide.left).toBe(1000 - 320 - popoverViewportMargin);
    expect(wide.left).toBeLessThan(narrow.left);
  });
});

describe("resolved position", () => {
  it("clamps an above-anchored menu that would open past the top", () => {
    // Control near the top of the window: opening upward puts the menu
    // off-screen, and the clamp has to catch it.
    const rect = { top: 20, bottom: 50, left: 400, right: 500 };

    expect(
      popoverPosition({ at: "element", rect, side: "above" }, size, viewport),
    ).toEqual({ left: 400, top: popoverViewportMargin });
  });

  it("clamps an end-aligned menu whose control sits at the left edge", () => {
    // #198's RunControl case in the other direction: right-aligning against a
    // control near the left edge computes a negative left.
    const rect = { top: 100, bottom: 130, left: 0, right: 40 };

    expect(
      popoverPosition({ at: "element", rect, align: "end" }, size, viewport),
    ).toEqual({ left: popoverViewportMargin, top: 130 + popoverAnchorGap });
  });
});
