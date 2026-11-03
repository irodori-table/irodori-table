// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDockview, type DockviewApi } from "dockview-react";
import {
  dockPanelConstraints,
  EDITOR_MIN_HEIGHT,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  settleSidebarDrag,
  shouldSnapClose,
  sidebarSnapWidth,
  withCurrentPanelConstraints,
} from "@/features/workbench/dock-constraints";

describe("shouldSnapClose", () => {
  it("snaps at half the usable minimum width", () => {
    expect(sidebarSnapWidth(120)).toBe(60);
    expect(shouldSnapClose(60, 120)).toBe(true);
    expect(shouldSnapClose(20, 120)).toBe(true);
    expect(shouldSnapClose(61, 120)).toBe(false);
    expect(shouldSnapClose(120, 120)).toBe(false);
  });

  it("treats a pointer past the sidebar's outer edge as a snap", () => {
    expect(shouldSnapClose(-30, 120)).toBe(true);
  });

  it("rounds sub-pixel widths before comparing", () => {
    expect(shouldSnapClose(60.4, 120)).toBe(true);
    expect(shouldSnapClose(60.6, 120)).toBe(false);
  });

  it("is checked against the floor dockview holds the sidebars at", () => {
    expect(dockPanelConstraints.leftSidebar.minimumWidth).toBe(
      LEFT_SIDEBAR_MIN_WIDTH,
    );
    expect(dockPanelConstraints.rightSidebar.minimumWidth).toBe(
      RIGHT_SIDEBAR_MIN_WIDTH,
    );
  });
});

describe("settleSidebarDrag", () => {
  const minimum = 120;

  it("does nothing when the drag left the sidebar where it was", () => {
    expect(
      settleSidebarDrag(
        { startWidth: 240, endWidth: 240.3, draggedTo: 240.3 },
        minimum,
      ),
    ).toEqual({ close: false, rememberWidth: null });
  });

  it("closes when the pointer reaches the snap width, even though dockview held the panel at its floor", () => {
    expect(
      settleSidebarDrag(
        { startWidth: 300, endWidth: 120, draggedTo: 40 },
        minimum,
      ),
    ).toEqual({ close: true, rememberWidth: 300 });
  });

  it("closes a sidebar already at its floor, which a resize never moves", () => {
    expect(
      settleSidebarDrag(
        { startWidth: 120, endWidth: 120, draggedTo: 50 },
        minimum,
      ),
    ).toEqual({ close: true, rememberWidth: 120 });
  });

  it("keeps the sidebar open at its floor when the pointer stops short of the snap", () => {
    expect(
      settleSidebarDrag(
        { startWidth: 300, endWidth: 120, draggedTo: 90 },
        minimum,
      ),
    ).toEqual({ close: false, rememberWidth: 120 });
  });

  it("never closes a sidebar that another sash pushed", () => {
    expect(
      settleSidebarDrag(
        { startWidth: 300, endWidth: 120, draggedTo: null },
        minimum,
      ),
    ).toEqual({ close: false, rememberWidth: 120 });
  });

  it("remembers the new width, rounded", () => {
    expect(
      settleSidebarDrag(
        { startWidth: 240, endWidth: 180.6, draggedTo: 180.6 },
        minimum,
      ),
    ).toEqual({ close: false, rememberWidth: 181 });
  });

  it("never remembers a width below the usable minimum", () => {
    // A window squeeze can leave a sidebar under its floor; closing it from
    // there keeps the width that was already stored.
    expect(
      settleSidebarDrag(
        { startWidth: 90, endWidth: 90, draggedTo: 30 },
        minimum,
      ),
    ).toEqual({ close: true, rememberWidth: null });
    expect(
      settleSidebarDrag(
        { startWidth: 300, endWidth: 100, draggedTo: null },
        minimum,
      ),
    ).toEqual({ close: false, rememberWidth: null });
  });
});

describe("withCurrentPanelConstraints", () => {
  const savedLayout = {
    grid: {
      root: { type: "branch" as const, data: [] },
      height: 600,
      width: 1000,
      orientation: "HORIZONTAL",
    },
    panels: {
      editor: {
        id: "editor",
        contentComponent: "workbenchPanel",
        title: "SQL Editor",
        minimumWidth: 360,
        minimumHeight: 220,
      },
      leftSidebar: {
        id: "leftSidebar",
        contentComponent: "workbenchPanel",
        minimumWidth: 132,
      },
      stray: { id: "stray", minimumHeight: 999 },
    },
  } as never;

  it("replaces saved floors with the current ones", () => {
    const next = withCurrentPanelConstraints(savedLayout);
    expect(next.panels.editor).toMatchObject({
      title: "SQL Editor",
      minimumWidth: 360,
      minimumHeight: EDITOR_MIN_HEIGHT,
    });
    expect(next.panels.leftSidebar.minimumWidth).toBe(LEFT_SIDEBAR_MIN_WIDTH);
  });

  it("leaves unknown panels and the input alone", () => {
    const next = withCurrentPanelConstraints(savedLayout);
    expect(next.panels.stray).toEqual({ id: "stray", minimumHeight: 999 });
    expect(
      (savedLayout as { panels: { editor: { minimumHeight: number } } }).panels
        .editor.minimumHeight,
    ).toBe(220);
  });
});

// Against real dockview, because the restore problem lives in its
// serialization: the panel floors travel inside the saved layout.
describe("restoring a saved dockview layout", () => {
  const apis: DockviewApi[] = [];

  beforeEach(() => {
    // jsdom has no ResizeObserver; dockview only uses it to follow its host's
    // size, which these tests set with layout() instead.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    apis.splice(0).forEach((api) => api.dispose());
    vi.unstubAllGlobals();
  });

  function dock(): DockviewApi {
    const element = document.createElement("div");
    document.body.append(element);
    const api = createDockview(element, {
      createComponent: () => ({
        element: document.createElement("div"),
        init: () => undefined,
      }),
    });
    api.layout(1000, 600);
    apis.push(api);
    return api;
  }

  function savedWithOldFloors() {
    const api = dock();
    api.addPanel({
      id: "editor",
      component: "workbenchPanel",
      minimumWidth: 360,
      minimumHeight: 220,
    });
    api.addPanel({
      id: "results",
      component: "workbenchPanel",
      minimumHeight: 180,
      position: { referencePanel: "editor", direction: "below" },
    });
    return JSON.parse(JSON.stringify(api.toJSON()));
  }

  it("brings back the floor the layout was saved with", () => {
    const saved = savedWithOldFloors();
    expect(saved.panels.editor.minimumHeight).toBe(220);

    const api = dock();
    api.fromJSON(saved);
    expect(api.getPanel("editor")?.group.minimumHeight).toBe(220);
  });

  it("applies the current floor once the layout is normalized", () => {
    const api = dock();
    api.fromJSON(withCurrentPanelConstraints(savedWithOldFloors()));
    expect(api.getPanel("editor")?.group.minimumHeight).toBe(EDITOR_MIN_HEIGHT);
    // ...and it is the new floor that gets saved from then on.
    expect(api.toJSON().panels.editor.minimumHeight).toBe(EDITOR_MIN_HEIGHT);
  });
});
