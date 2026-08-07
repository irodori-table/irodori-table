import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

/**
 * Positioning, clamping and dismissal for portaled popovers (#168).
 *
 * The app had grown five hand-written viewport clamps — EditorTabStrip,
 * RunControl, Sidebar, LakehousePanel, WorkbenchShell — plus two menus with no
 * clamp at all, four positioning strategies and two incompatible dismiss
 * patterns. Three of those surfaces shipped positioning bugs (#52, #114, #115,
 * #124). Every clamp guessed the menu's size with a hardcoded constant
 * (`menuWidth` of 218, 220, 238, 270 …), so each one drifted out of sync with
 * the CSS that actually decides how wide the menu renders, and a guess that is
 * too small clamps too late — the menu still overflows.
 *
 * This module removes the guess: the popover is measured after it mounts and
 * clamped against its real box. The trade-off is that the size is only known
 * once the element exists, so positioning takes two passes; `useLayoutEffect`
 * runs the second one before the browser paints, so nothing is visible at the
 * unclamped position.
 */

/** Gap kept between a popover and the window edge. */
export const popoverViewportMargin = 8;

/** Default distance between a popover and the control it is anchored to. */
export const popoverAnchorGap = 4;

/** The part of a `DOMRect` an anchor needs; lets tests pass plain objects. */
export type PopoverRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type PopoverSize = {
  width: number;
  height: number;
};

export type PopoverViewport = {
  width: number;
  height: number;
};

export type PopoverPosition = {
  left: number;
  top: number;
};

/**
 * Where a popover wants to open.
 *
 * `pointer` is a context menu at the cursor. `element` is a menu attached to a
 * control: `side` picks above/below the control, `align` picks which vertical
 * edge they share — `end` right-aligns the menu with the control, which is what
 * a menu hanging off a right-hand button wants.
 */
export type PopoverAnchor =
  | { at: "pointer"; x: number; y: number }
  | {
      at: "element";
      rect: PopoverRect;
      side?: "below" | "above";
      align?: "start" | "end";
      gap?: number;
    };

/** Where the popover would go with the whole viewport to itself. */
export function popoverPreferredPosition(
  anchor: PopoverAnchor,
  size: PopoverSize,
): PopoverPosition {
  if (anchor.at === "pointer") {
    return { left: anchor.x, top: anchor.y };
  }
  const gap = anchor.gap ?? popoverAnchorGap;
  return {
    left:
      anchor.align === "end"
        ? anchor.rect.right - size.width
        : anchor.rect.left,
    top:
      anchor.side === "above"
        ? anchor.rect.top - size.height - gap
        : anchor.rect.bottom + gap,
  };
}

/**
 * Pull an inset back inside the viewport.
 *
 * The far limit is itself floored at the margin: a popover taller or wider than
 * the window has no position that fits, and without the floor the limit goes
 * negative and drags it off the near edge instead — trading a clipped bottom
 * for a clipped top, which is worse because the top holds the first menu item.
 */
function clampInset(value: number, extent: number, viewport: number): number {
  const far = Math.max(
    popoverViewportMargin,
    viewport - extent - popoverViewportMargin,
  );
  return Math.max(popoverViewportMargin, Math.min(value, far));
}

/** Clamp a position so a box of `size` stays fully inside `viewport`. */
export function clampPopoverToViewport(
  position: PopoverPosition,
  size: PopoverSize,
  viewport: PopoverViewport,
): PopoverPosition {
  return {
    left: clampInset(position.left, size.width, viewport.width),
    top: clampInset(position.top, size.height, viewport.height),
  };
}

/** Resolve an anchor to a clamped viewport position. Pure; exported for tests. */
export function popoverPosition(
  anchor: PopoverAnchor,
  size: PopoverSize,
  viewport: PopoverViewport,
): PopoverPosition {
  return clampPopoverToViewport(
    popoverPreferredPosition(anchor, size),
    size,
    viewport,
  );
}

function currentViewport(): PopoverViewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

// Re-measuring on every render would loop, and the anchor object is usually
// rebuilt inline by the caller, so identity is useless as a dependency. Key on
// the values instead.
function anchorKey(anchor: PopoverAnchor | null): string {
  if (!anchor) {
    return "";
  }
  if (anchor.at === "pointer") {
    return `pointer:${anchor.x}:${anchor.y}`;
  }
  const {
    rect,
    side = "below",
    align = "start",
    gap = popoverAnchorGap,
  } = anchor;
  return `element:${rect.top}:${rect.bottom}:${rect.left}:${rect.right}:${side}:${align}:${gap}`;
}

export type UsePopoverPositionResult<T extends HTMLElement> = {
  /** Attach to the popover element; it is what gets measured. */
  ref: RefObject<T | null>;
  /** `position: fixed` plus the resolved insets. Spread into `style`. */
  style: CSSProperties;
};

/**
 * Position a portaled popover: fixed, clamped to the viewport, measured rather
 * than guessed.
 *
 * `position: fixed` is set inline on purpose. These popovers are portaled to
 * `<body>` to escape ancestors with `overflow`/`transform`/`contain` — a
 * `transform` ancestor becomes the containing block for a fixed element and
 * offsets it from the pointer (#115), and an `overflow: hidden` one clips it
 * (#114). Keeping the declaration inline means a stylesheet change cannot
 * silently drop it, and a jsdom test can read it back.
 *
 * Pass `null` when the popover is closed.
 */
export function usePopoverPosition<T extends HTMLElement>(
  anchor: PopoverAnchor | null,
): UsePopoverPositionResult<T> {
  const ref = useRef<T | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const key = anchorKey(anchor);

  useLayoutEffect(() => {
    if (!anchor || typeof window === "undefined") {
      setPosition(null);
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }

    // `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()`. Both give the
    // border box, but the rect is post-transform — and every one of these menus
    // enters through the `irodori-pop-in` keyframes, which start at
    // `scale(0.985) translateY(-3px)`. Measuring the rect on the frame the menu
    // mounts therefore reads a box ~1.5% smaller than the one it settles at,
    // and the popover lands a few pixels off its anchor. The offset metrics
    // ignore transforms, so they describe where the menu will actually be.
    //
    // Under jsdom both are always zero — jsdom does no layout — so unit tests
    // that assert clamping have to supply a size (see
    // src/tests/helpers/popover.ts); the real geometry guard is the browser
    // suite.
    const reposition = () => {
      const next = popoverPosition(
        anchor,
        { width: node.offsetWidth, height: node.offsetHeight },
        currentViewport(),
      );
      // Only on a real change: writing the same position back would let the
      // observer below re-enter for no reason.
      setPosition((current) =>
        current && current.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };

    reposition();

    // One measurement is not enough. The first pass runs against whatever the
    // box is at mount, and it keeps changing afterwards — a webfont swaps in, a
    // long label wraps, an async item list fills in — each of which silently
    // invalidates the position that was computed from the old size. Observing
    // the element closes that window; repositioning does not itself change the
    // box, so this settles rather than loops.
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(reposition);
    observer.observe(node);
    return () => observer.disconnect();
    // `key` stands in for the anchor's values; `anchor` itself changes identity
    // on every render of the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Before the measuring pass has run there is no honest position to render at.
  // Falling back to the unmeasured preferred position (rather than hiding)
  // keeps the popover on screen for the one frame it takes: `useLayoutEffect`
  // corrects it before paint, and a test that renders without layout still sees
  // a positioned element.
  const fallback =
    anchor && typeof window !== "undefined"
      ? popoverPosition(anchor, { width: 0, height: 0 }, currentViewport())
      : null;
  const resolved = position ?? fallback;

  return {
    ref,
    style: {
      position: "fixed",
      left: resolved?.left,
      top: resolved?.top,
    },
  };
}

/**
 * Close a portaled popover on an outside pointer press, Escape, or window blur.
 *
 * The trap this exists to stop repeating: a portaled popover **cannot** rely on
 * `stopPropagation` at its own root to keep a document-level closer from
 * firing. The portal's DOM lives outside the anchor's tree, but React still
 * re-dispatches the event through its own tree, so the two mechanisms disagree
 * about whether the click was "inside". A ref + `contains` check asks the
 * question the portal does not confuse: is the real event target within the
 * real popover element?
 *
 * Pointer press, not click, so the popover closes on the same gesture that
 * starts an interaction elsewhere — and `pointerdown` on a menu item still lets
 * that item's own `click` fire afterwards, because the ref check keeps it open.
 */
export function usePopoverDismiss(
  ref: RefObject<HTMLElement | null> | readonly RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  active = true,
): void {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  // A menu opened from a toggle button has *two* insides. Press the toggle
  // while the menu is open and a menu-only check dismisses on `pointerdown`,
  // then the button's `click` reopens it — so the menu appears not to close at
  // all. The control counts as inside for dismissal; its own handler decides
  // what the press means.
  const refs = useRef<readonly RefObject<HTMLElement | null>[]>([]);
  refs.current = Array.isArray(ref)
    ? ref
    : [ref as RefObject<HTMLElement | null>];

  useEffect(() => {
    if (!active) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        refs.current.some((candidate) => candidate.current?.contains(target))
      ) {
        return;
      }
      dismiss.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      dismiss.current();
    };
    const onBlur = () => dismiss.current();

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
    // `refs` is a ref box, so the listener always reads the current array and
    // does not need re-binding when the caller passes a new one.
  }, [active]);
}

/** Convenience for callers that need both hooks against the same element. */
export function useAnchoredMenu<T extends HTMLElement>(
  anchor: PopoverAnchor | null,
  onDismiss: () => void,
): UsePopoverPositionResult<T> {
  const { ref, style } = usePopoverPosition<T>(anchor);
  const dismiss = useCallback(() => onDismiss(), [onDismiss]);
  usePopoverDismiss(ref, dismiss, anchor !== null);
  return { ref, style };
}

/**
 * The non-positional styling a portaled popover needs, in one place.
 *
 * `zIndex` reads the `--popover-z` token rather than repeating a literal: three
 * components used to set `z-index: 60` inline while `.app-menu-popover`'s
 * stylesheet rule said 25, so which popover won depended on which code path had
 * opened it (#52 was the first shipped symptom of that ad-hoc styling).
 *
 * `right: auto` cancels the `right: 0` those menu classes inherit for their
 * non-portaled, anchor-relative layout. Left in place it would fight the `left`
 * this module resolves.
 */
export const popoverSurfaceStyle: CSSProperties = {
  right: "auto",
  zIndex: "var(--popover-z)",
};
