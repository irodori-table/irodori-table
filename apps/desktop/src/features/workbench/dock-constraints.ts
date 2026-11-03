import type { SerializedDockview } from "dockview-react";

export type WorkbenchDockPanelId =
  | "leftSidebar"
  | "editor"
  | "results"
  | "rightSidebar";

type DockPanelConstraints = {
  minimumWidth?: number;
  minimumHeight?: number;
};

// The narrowest a sidebar goes while open: view tabs are icons and rows
// truncate, but everything still fits inside the panel. The binding content
// is the left side's five view tabs (5 x 22 once trimmed, plus the strip's
// 4px padding: 114) and the object browser header's four actions (4 x 22 +
// 3 x 5 gaps + 12px padding: 115). Dragging the sash on past this does not
// squeeze the panel further; drag the pointer to half this width and the
// sidebar snaps closed on release (VS Code-style), and the titlebar toggle
// brings it back at the width it had before the drag.
export const LEFT_SIDEBAR_MIN_WIDTH = 120;
export const RIGHT_SIDEBAR_MIN_WIDTH = 120;

// Enough editor to keep working in while the results pane takes the rest of
// the height. At 100% UI zoom: tab strip (--bar-md, 33) + CodeMirror's top
// content padding (4) + two lines (--editor-line-height, 2 x 20) + run toolbar
// (--bar-md, 33) = 110.
export const EDITOR_MIN_WIDTH = 360;
export const EDITOR_MIN_HEIGHT = 110;
export const RESULTS_MIN_HEIGHT = 180;

export const dockPanelConstraints: Record<
  WorkbenchDockPanelId,
  DockPanelConstraints
> = {
  leftSidebar: { minimumWidth: LEFT_SIDEBAR_MIN_WIDTH },
  editor: { minimumWidth: EDITOR_MIN_WIDTH, minimumHeight: EDITOR_MIN_HEIGHT },
  results: { minimumHeight: RESULTS_MIN_HEIGHT },
  rightSidebar: { minimumWidth: RIGHT_SIDEBAR_MIN_WIDTH },
};

/** The dragged width at or below which a sidebar snaps closed. */
export function sidebarSnapWidth(minimum: number): number {
  return Math.floor(minimum / 2);
}

/**
 * VS Code's rule: dragging a view to half its minimum width closes it.
 * `width` is where the pointer would put the sidebar's edge, which can be
 * well inside the minimum dockview holds the panel at.
 */
export function shouldSnapClose(width: number, minimum: number): boolean {
  return Math.round(width) <= sidebarSnapWidth(minimum);
}

export type SidebarDrag = {
  /** Panel width when the drag started. */
  startWidth: number;
  /** Panel width when it ended, after dockview's clamping. */
  endWidth: number;
  /**
   * The width the pointer asked for when the drag was on this sidebar's own
   * sash, or null when another sash moved it.
   */
  draggedTo: number | null;
};

export type SidebarDragOutcome = {
  close: boolean;
  /** The width to reopen at, or null to keep the one already stored. */
  rememberWidth: number | null;
};

/**
 * What a finished sash drag means for one sidebar. A snap close remembers the
 * width the drag started from rather than the floor it was dragged through,
 * so reopening brings the sidebar back the way it was.
 */
export function settleSidebarDrag(
  { startWidth, endWidth, draggedTo }: SidebarDrag,
  minimum: number,
): SidebarDragOutcome {
  if (draggedTo !== null && shouldSnapClose(draggedTo, minimum)) {
    return {
      close: true,
      rememberWidth: startWidth >= minimum ? Math.round(startWidth) : null,
    };
  }
  if (Math.round(startWidth) === Math.round(endWidth)) {
    return { close: false, rememberWidth: null };
  }
  return {
    close: false,
    rememberWidth: endWidth >= minimum ? Math.round(endWidth) : null,
  };
}

/**
 * dockview writes each panel's minimum size into the saved layout and
 * `fromJSON` rebuilds the panel from it, so a restored layout keeps the floors
 * that were current when it was saved. Overwrite them with today's before
 * restoring, or a changed floor would never reach an existing install.
 */
export function withCurrentPanelConstraints(
  layout: SerializedDockview,
): SerializedDockview {
  const panels = { ...layout.panels };
  for (const [id, constraints] of Object.entries(dockPanelConstraints)) {
    const panel = panels[id];
    if (panel) {
      panels[id] = {
        ...panel,
        minimumWidth: constraints.minimumWidth,
        minimumHeight: constraints.minimumHeight,
      };
    }
  }
  return { ...layout, panels };
}
