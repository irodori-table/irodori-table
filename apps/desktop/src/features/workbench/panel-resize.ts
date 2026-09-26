import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type { EditorSplitMode } from "./store/workbench-store";
import { clampNumber, type ValueUpdater } from "@/core";

type NumberSetter = (value: ValueUpdater<number>) => void;

export type PanelResizeKind =
  | "sidebar"
  | "rightSidebar"
  | "leftInspector"
  | "inspector"
  | "results"
  | "editorSplit";

/**
 * Narrow enough for the search field to be usable rather than merely present.
 * It was 180 because the field could not shrink past its own min-content and
 * was clipped instead; now that it can, the floor is the view switcher's row.
 */
export const SIDEBAR_WIDTH_MIN = 140;
export const SIDEBAR_WIDTH_MAX = 420;
export const INSPECTOR_WIDTH_MIN = 220;
export const INSPECTOR_WIDTH_MAX = 420;
/**
 * Absolute floor for the results pane. The old fixed 220 could not shrink past
 * the header plus the action bar, so a tall grid could never give space back to
 * the editor. The real floor is measured from the pane's own chrome in
 * {@link resultsHeightFloor}; this is the fallback when the pane is not mounted.
 */
export const RESULTS_HEIGHT_MIN = 96;
export const RESULTS_HEIGHT_MAX = 560;
export const EDITOR_SPLIT_MIN = 28;
export const EDITOR_SPLIT_MAX = 72;

/** Keep one result row visible below the chrome, so shrinking never bottoms out. */
const RESULTS_BODY_MIN = 24;

/**
 * Shrink no further than the pane's own chrome (header, action bar, any open
 * error or filter rows) plus one result row. A constant floor clipped a wrapped
 * header on narrow panes; measuring keeps the text intact and stops exactly
 * where the content would otherwise be crushed.
 */
function resultsHeightFloor(): number {
  const pane = document.querySelector<HTMLElement>(".results-pane");
  if (!pane) return RESULTS_HEIGHT_MIN;
  const children = Array.from(pane.children);
  const chrome = children
    .slice(0, Math.max(0, children.length - 1))
    .reduce((sum, child) => sum + (child as HTMLElement).offsetHeight, 0);
  return Math.max(RESULTS_HEIGHT_MIN, chrome + RESULTS_BODY_MIN);
}

type PanelResizeControllerOptions = {
  sidebarWidth: number;
  inspectorWidth: number;
  resultsHeight: number;
  editorSplitMode: EditorSplitMode;
  editorSplitRef: RefObject<HTMLDivElement | null>;
  setSidebarWidth: NumberSetter;
  setInspectorWidth: NumberSetter;
  setResultsHeight: NumberSetter;
  setEditorSplitPercent: NumberSetter;
};

export function createPanelResizeController({
  sidebarWidth,
  inspectorWidth,
  resultsHeight,
  editorSplitMode,
  editorSplitRef,
  setSidebarWidth,
  setInspectorWidth,
  setResultsHeight,
  setEditorSplitPercent,
}: PanelResizeControllerOptions) {
  function resizePanel(kind: PanelResizeKind, delta: number) {
    switch (kind) {
      case "sidebar":
      case "rightSidebar":
        setSidebarWidth((current) =>
          clampNumber(current + delta, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX),
        );
        break;
      case "leftInspector":
      case "inspector":
        setInspectorWidth((current) =>
          clampNumber(
            current + delta,
            INSPECTOR_WIDTH_MIN,
            INSPECTOR_WIDTH_MAX,
          ),
        );
        break;
      case "results":
        setResultsHeight((current) =>
          clampNumber(
            current + delta,
            resultsHeightFloor(),
            RESULTS_HEIGHT_MAX,
          ),
        );
        break;
      case "editorSplit":
        setEditorSplitPercent((current) =>
          clampNumber(current + delta, EDITOR_SPLIT_MIN, EDITOR_SPLIT_MAX),
        );
        break;
    }
  }

  function beginPanelResize(
    kind: PanelResizeKind,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    // Capture the pointer so the matching up/cancel event is delivered here even
    // when the drag ends outside the window. Without it a release off-window was
    // sometimes missed and `body.panel-resizing` stayed set, leaving the resize
    // guide line painted after the drag was over.
    target.setPointerCapture?.(pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startSidebarWidth = sidebarWidth;
    const startInspectorWidth = inspectorWidth;
    const startResultsHeight = resultsHeight;
    const resultsFloor = resultsHeightFloor();
    const editorSplitBounds = editorSplitRef.current?.getBoundingClientRect();
    document.body.classList.add("panel-resizing");

    const onMove = (moveEvent: PointerEvent) => {
      if (kind === "editorSplit") {
        if (!editorSplitBounds) {
          return;
        }
        const next =
          editorSplitMode === "down"
            ? ((moveEvent.clientY - editorSplitBounds.top) /
                Math.max(1, editorSplitBounds.height)) *
              100
            : ((moveEvent.clientX - editorSplitBounds.left) /
                Math.max(1, editorSplitBounds.width)) *
              100;
        setEditorSplitPercent(
          clampNumber(next, EDITOR_SPLIT_MIN, EDITOR_SPLIT_MAX),
        );
        return;
      }
      if (kind === "sidebar" || kind === "rightSidebar") {
        const delta = moveEvent.clientX - startX;
        setSidebarWidth(
          clampNumber(
            startSidebarWidth + (kind === "rightSidebar" ? -delta : delta),
            SIDEBAR_WIDTH_MIN,
            SIDEBAR_WIDTH_MAX,
          ),
        );
        return;
      }
      if (kind === "inspector") {
        setInspectorWidth(
          clampNumber(
            startInspectorWidth - (moveEvent.clientX - startX),
            INSPECTOR_WIDTH_MIN,
            INSPECTOR_WIDTH_MAX,
          ),
        );
        return;
      }
      if (kind === "leftInspector") {
        setInspectorWidth(
          clampNumber(
            startInspectorWidth + (moveEvent.clientX - startX),
            INSPECTOR_WIDTH_MIN,
            INSPECTOR_WIDTH_MAX,
          ),
        );
        return;
      }
      setResultsHeight(
        clampNumber(
          startResultsHeight - (moveEvent.clientY - startY),
          resultsFloor,
          RESULTS_HEIGHT_MAX,
        ),
      );
    };

    const onEnd = () => {
      document.body.classList.remove("panel-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      target.removeEventListener("lostpointercapture", onEnd);
      if (target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
    // Fires when the capture is released for any reason, including the window
    // losing focus mid-drag, so the guide line is always cleared.
    target.addEventListener("lostpointercapture", onEnd, { once: true });
  }

  function onPanelResizeKey(
    kind: PanelResizeKind,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 32 : 16;
    if (kind === "editorSplit") {
      if (editorSplitMode === "down") {
        resizePanel(kind, event.key === "ArrowDown" ? 4 : -4);
      } else {
        resizePanel(kind, event.key === "ArrowRight" ? 4 : -4);
      }
      return;
    }
    if (kind === "results") {
      resizePanel(kind, event.key === "ArrowUp" ? step : -step);
      return;
    }
    if (kind === "sidebar" || kind === "rightSidebar") {
      const direction = kind === "rightSidebar" ? -1 : 1;
      resizePanel(
        kind,
        (event.key === "ArrowRight" ? step : -step) * direction,
      );
      return;
    }
    if (kind === "leftInspector") {
      resizePanel(kind, event.key === "ArrowRight" ? step : -step);
      return;
    }
    resizePanel(kind, event.key === "ArrowLeft" ? step : -step);
  }

  return { beginPanelResize, onPanelResizeKey };
}
