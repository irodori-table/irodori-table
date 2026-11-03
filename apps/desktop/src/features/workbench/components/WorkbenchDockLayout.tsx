import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from "dockview-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import {
  dockPanelConstraints,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  settleSidebarDrag,
  shouldSnapClose,
  withCurrentPanelConstraints,
  type WorkbenchDockPanelId,
} from "../dock-constraints";
import type { WorkbenchSide } from "../types";

type WorkbenchDockPanelContent = Record<WorkbenchDockPanelId, ReactNode>;

type Disposable = {
  dispose: () => void;
};

export type WorkbenchDockLayoutProps = {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  resultsHeight: number;
  leftSidebar: ReactNode;
  rightSidebar: ReactNode;
  editor: ReactNode;
  results: ReactNode;
  /** A sash drag left this sidebar at a usable width worth reopening at. */
  onSidebarWidthChange?: (side: WorkbenchSide, width: number) => void;
  /** A sash drag pulled this sidebar to its snap width: close it. */
  onSidebarSnapClose?: (side: WorkbenchSide) => void;
};

// v2: sidebars dock at the root edges (full workspace height, VS Code-style)
// instead of splitting only the editor row; old layouts would keep the
// results pane at full window width, so they are not restored.
const dockLayoutStorageKey = "irodori.workbench.dockview.layout.v2";
const legacyDockLayoutStorageKeys = ["irodori.workbench.dockview.layout.v1"];
const dockPanelIds: readonly WorkbenchDockPanelId[] = [
  "leftSidebar",
  "editor",
  "results",
  "rightSidebar",
];

const sidebarPanels = [
  { side: "left", id: "leftSidebar", minimum: LEFT_SIDEBAR_MIN_WIDTH },
  { side: "right", id: "rightSidebar", minimum: RIGHT_SIDEBAR_MIN_WIDTH },
] as const;

// dockview v7 stamps a theme's `className` onto its inner `.dv-shell`, and every
// `--dv-*` variable the dock reads is resolved there. Without an explicit theme it
// falls back to the built-in dark `themeAbyss`, whose values then shadow our
// `.dockview-theme-irodori` overrides for all dock content -- most visibly turning
// the panel separators into a heavy near-black line (--dv-separator-border: #2b2b4a)
// instead of the app's soft `--border`. Pointing the theme's className back at our
// own class makes the shell pick up the light Irodori variables again. The palette
// itself lives in workbench.css and is theme-adaptive (light/dark), so `colorScheme`
// -- unused by dockview 7.0.2 anyway -- stays a static hint; `tabGroupIndicator:
// "none"` preserves the abyss default we were implicitly relying on (the group tab
// strip is hidden via CSS).
const IRODORI_DOCKVIEW_THEME: DockviewTheme = {
  name: "irodori",
  className: "dockview-theme-irodori",
  colorScheme: "light",
  tabGroupIndicator: "none",
};

const DockPanelContentContext = createContext<WorkbenchDockPanelContent | null>(
  null,
);

const dockComponents = {
  workbenchPanel: WorkbenchDockPanel,
};

export function WorkbenchDockLayout({
  leftSidebarOpen,
  rightSidebarOpen,
  sidebarWidth,
  inspectorWidth,
  resultsHeight,
  leftSidebar,
  rightSidebar,
  editor,
  results,
  onSidebarWidthChange,
  onSidebarSnapClose,
}: WorkbenchDockLayoutProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const apiRef = useRef<DockviewApi | null>(null);
  const readyRef = useRef(false);
  const layoutDisposableRef = useRef<Disposable | null>(null);
  // Read when a sash drag ends, which can be after a re-render.
  const sidebarCallbacksRef = useRef({
    onSidebarWidthChange,
    onSidebarSnapClose,
  });
  sidebarCallbacksRef.current = { onSidebarWidthChange, onSidebarSnapClose };
  const panelContent = useMemo<WorkbenchDockPanelContent>(
    () => ({
      leftSidebar,
      editor,
      results,
      rightSidebar,
    }),
    [editor, leftSidebar, results, rightSidebar],
  );

  const saveLayout = useCallback((api: DockviewApi) => {
    if (!readyRef.current || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      dockLayoutStorageKey,
      JSON.stringify(api.toJSON()),
    );
  }, []);

  const addEditorPanel = useCallback(
    (api: DockviewApi) => {
      if (api.getPanel("editor")) {
        return;
      }
      api.addPanel({
        id: "editor",
        component: "workbenchPanel",
        title: t("dock.sqlEditor"),
        renderer: "always",
        ...dockPanelConstraints.editor,
      });
    },
    [t],
  );

  const addResultsPanel = useCallback(
    (api: DockviewApi) => {
      if (api.getPanel("results")) {
        return;
      }
      addEditorPanel(api);
      api.addPanel({
        id: "results",
        component: "workbenchPanel",
        title: t("dock.results"),
        renderer: "always",
        initialHeight: resultsHeight,
        ...dockPanelConstraints.results,
        position: {
          referencePanel: "editor",
          direction: "below",
        },
      });
    },
    [addEditorPanel, resultsHeight, t],
  );

  const addLeftSidebarPanel = useCallback(
    (api: DockviewApi) => {
      if (api.getPanel("leftSidebar")) {
        return;
      }
      addEditorPanel(api);
      const otherSidebar = api.getPanel("rightSidebar");
      const otherWidth = otherSidebar?.api.width;
      const panel = api.addPanel({
        id: "leftSidebar",
        component: "workbenchPanel",
        title: t("dock.explorer"),
        renderer: "always",
        initialWidth: sidebarWidth,
        ...dockPanelConstraints.leftSidebar,
        // Dock at the root edge (no reference panel) so the sidebar spans
        // the full workspace height with the editor/results split inside.
        position: {
          direction: "left",
        },
      });
      // Dockview distributes the container proportionally when a root-edge
      // panel is inserted, ignoring initialWidth and rescaling the opposite
      // sidebar; pin both widths explicitly (the editor absorbs the change).
      // The rescale lands after this tick, so pin again on the next frame.
      const pinWidths = () => {
        panel.api.setSize({ width: sidebarWidth });
        if (otherSidebar && otherWidth) {
          otherSidebar.api.setSize({ width: otherWidth });
        }
      };
      pinWidths();
      requestAnimationFrame(pinWidths);
    },
    [addEditorPanel, sidebarWidth, t],
  );

  const addRightSidebarPanel = useCallback(
    (api: DockviewApi) => {
      if (api.getPanel("rightSidebar")) {
        return;
      }
      addEditorPanel(api);
      const otherSidebar = api.getPanel("leftSidebar");
      const otherWidth = otherSidebar?.api.width;
      const panel = api.addPanel({
        id: "rightSidebar",
        component: "workbenchPanel",
        title: t("dock.inspector"),
        renderer: "always",
        initialWidth: inspectorWidth,
        ...dockPanelConstraints.rightSidebar,
        // Root-edge dock, same reason as the left sidebar.
        position: {
          direction: "right",
        },
      });
      // Same as the left sidebar: pin the new width and restore the opposite
      // sidebar's width, which the root-edge insertion rescales. The rescale
      // lands after this tick, so pin again on the next frame.
      const pinWidths = () => {
        panel.api.setSize({ width: inspectorWidth });
        if (otherSidebar && otherWidth) {
          otherSidebar.api.setSize({ width: otherWidth });
        }
      };
      pinWidths();
      requestAnimationFrame(pinWidths);
    },
    [addEditorPanel, inspectorWidth, t],
  );

  const addDefaultPanels = useCallback(
    (api: DockviewApi) => {
      addEditorPanel(api);
      addResultsPanel(api);
      if (leftSidebarOpen) {
        addLeftSidebarPanel(api);
      }
      if (rightSidebarOpen) {
        addRightSidebarPanel(api);
      }
    },
    [
      addEditorPanel,
      addLeftSidebarPanel,
      addResultsPanel,
      addRightSidebarPanel,
      inspectorWidth,
      leftSidebarOpen,
      rightSidebarOpen,
      sidebarWidth,
    ],
  );

  const syncPanels = useCallback(
    (api: DockviewApi) => {
      for (const panel of Array.from(api.panels)) {
        if (!isDockPanelId(panel.id)) {
          api.removePanel(panel);
        }
      }

      addEditorPanel(api);
      addResultsPanel(api);

      // Removing a root-edge panel makes dockview redistribute the freed space
      // proportionally, which stretches the surviving sidebar — closing one at
      // 320px grew the other from 260 to 618, and reopening it then restored
      // 258 instead of its stored 320, so the width was lost for good. The
      // insert path already pins widths for the mirror-image reason; the
      // removal path did not. Same trick: pin now, and again next frame,
      // because the rescale lands after this tick.
      const pinSurvivor = (id: string, width: number) => {
        const survivor = api.getPanel(id);
        if (!survivor) {
          return;
        }
        const pin = () => survivor.api.setSize({ width });
        pin();
        requestAnimationFrame(pin);
      };

      const leftPanel = api.getPanel("leftSidebar");
      if (leftSidebarOpen) {
        addLeftSidebarPanel(api);
      } else if (leftPanel) {
        api.removePanel(leftPanel);
        pinSurvivor("rightSidebar", inspectorWidth);
      }

      const rightPanel = api.getPanel("rightSidebar");
      if (rightSidebarOpen) {
        addRightSidebarPanel(api);
      } else if (rightPanel) {
        api.removePanel(rightPanel);
        pinSurvivor("leftSidebar", sidebarWidth);
      }
    },
    [
      addEditorPanel,
      addLeftSidebarPanel,
      addResultsPanel,
      addRightSidebarPanel,
      leftSidebarOpen,
      rightSidebarOpen,
    ],
  );

  const restoreLayout = useCallback(
    (api: DockviewApi) => {
      if (typeof window === "undefined") {
        addDefaultPanels(api);
        return;
      }
      for (const legacyKey of legacyDockLayoutStorageKeys) {
        window.localStorage.removeItem(legacyKey);
      }
      const raw = window.localStorage.getItem(dockLayoutStorageKey);
      if (!raw) {
        addDefaultPanels(api);
        return;
      }
      try {
        api.fromJSON(
          withCurrentPanelConstraints(JSON.parse(raw) as SerializedDockview),
        );
        syncPanels(api);
      } catch {
        window.localStorage.removeItem(dockLayoutStorageKey);
        api.clear();
        addDefaultPanels(api);
      }
    },
    [addDefaultPanels, syncPanels],
  );

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      apiRef.current = api;
      restoreLayout(api);
      readyRef.current = true;
      saveLayout(api);
    },
    [restoreLayout, saveLayout],
  );

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !readyRef.current) {
      return;
    }
    syncPanels(api);
    saveLayout(api);
  }, [saveLayout, syncPanels]);

  useEffect(() => {
    const api = apiRef.current;
    if (api && readyRef.current) {
      layoutDisposableRef.current = api.onDidLayoutChange(() =>
        saveLayout(api),
      );
    }
    return () => {
      layoutDisposableRef.current?.dispose();
      layoutDisposableRef.current = null;
      // Dockview keeps its API during React's StrictMode effect replay and
      // does not fire onReady again. Keep that reference so later toggles
      // can still add panels; only the subscription belongs to this effect.
    };
  }, [saveLayout]);

  // dockview has no snap-to-close for its groups, and it holds a sidebar at
  // its minimum while the pointer keeps going, so sidebar drags are settled
  // here: the pointer, not the clamped panel, says how far the user dragged.
  // Only a sash drag can close a sidebar -- shrinking the window squeezes
  // sidebars too, and that must not take one away.
  const handleSashPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const api = apiRef.current;
      const sash =
        event.target instanceof Element
          ? event.target.closest(".dv-sash")
          : null;
      if (!api || !sash) {
        return;
      }
      const dock = event.currentTarget;
      const sashBox = sash.getBoundingClientRect();
      const verticalSash = sashBox.height > sashBox.width;
      const startX = event.clientX;
      const drags = sidebarPanels.flatMap((sidebar) => {
        const panel = api.getPanel(sidebar.id);
        const content = dock.querySelector(
          `.workbench-dock-panel.${sidebar.id}`,
        );
        if (!panel || !content) {
          return [];
        }
        const box = content.getBoundingClientRect();
        const innerEdge = sidebar.side === "left" ? box.right : box.left;
        return [
          {
            ...sidebar,
            startWidth: panel.api.width,
            // The sash on the sidebar's inner edge is its own; any other
            // sash can only push it.
            ownSash:
              verticalSash &&
              innerEdge >= sashBox.left - 1 &&
              innerEdge <= sashBox.right + 1,
          },
        ];
      });
      const draggedTo = (drag: (typeof drags)[number], clientX: number) =>
        drag.ownSash
          ? drag.startWidth +
            (drag.side === "left" ? clientX - startX : startX - clientX)
          : null;

      const doc = dock.ownerDocument;
      // Dim the sidebar while releasing would close it, the cue VS Code gives
      // by collapsing it under the pointer.
      const preview = (move: PointerEvent) => {
        const closing = drags.find((drag) => {
          const width = draggedTo(drag, move.clientX);
          return width !== null && shouldSnapClose(width, drag.minimum);
        });
        if (closing) {
          dock.dataset.snapClose = closing.side;
        } else {
          delete dock.dataset.snapClose;
        }
      };
      const finish = (end: PointerEvent) => {
        doc.removeEventListener("pointermove", preview);
        doc.removeEventListener("pointerup", finish);
        doc.removeEventListener("pointercancel", finish);
        delete dock.dataset.snapClose;
        const outcomes = drags.flatMap((drag) => {
          const endWidth = api.getPanel(drag.id)?.api.width;
          if (endWidth === undefined) {
            return [];
          }
          const outcome = settleSidebarDrag(
            {
              startWidth: drag.startWidth,
              endWidth,
              // A cancelled drag never asks to close anything.
              draggedTo:
                end.type === "pointerup" ? draggedTo(drag, end.clientX) : null,
            },
            drag.minimum,
          );
          return [{ side: drag.side, ...outcome }];
        });
        // dockview records the dragged sizes in its own pointerup listener,
        // which runs after this one. A re-render before then relays the dock
        // out from the pre-drag proportions and undoes the drag, so the store
        // is only told once this event has finished dispatching.
        setTimeout(() => {
          const { onSidebarWidthChange, onSidebarSnapClose } =
            sidebarCallbacksRef.current;
          for (const outcome of outcomes) {
            if (outcome.rememberWidth !== null) {
              onSidebarWidthChange?.(outcome.side, outcome.rememberWidth);
            }
            if (outcome.close) {
              onSidebarSnapClose?.(outcome.side);
            }
          }
        }, 0);
      };
      doc.addEventListener("pointermove", preview);
      doc.addEventListener("pointerup", finish);
      doc.addEventListener("pointercancel", finish);
    },
    [],
  );

  return (
    <DockPanelContentContext.Provider value={panelContent}>
      <div
        className="workbench-dock dockview-theme-irodori"
        onPointerDownCapture={handleSashPointerDown}
      >
        <DockviewReact
          components={dockComponents}
          defaultTabComponent={WorkbenchDockTab}
          dndStrategy="pointer"
          getTabContextMenuItems={() => []}
          keyboardNavigation
          theme={IRODORI_DOCKVIEW_THEME}
          onReady={handleReady}
        />
      </div>
    </DockPanelContentContext.Provider>
  );
}

function WorkbenchDockPanel({ api }: IDockviewPanelProps) {
  const content = useContext(DockPanelContentContext);
  const panelId = isDockPanelId(api.id) ? api.id : "editor";
  return (
    <div className={`workbench-dock-panel ${panelId}`}>
      {content?.[panelId] ?? null}
    </div>
  );
}

function WorkbenchDockTab({ api }: IDockviewPanelHeaderProps) {
  return <span className="workbench-dock-tab">{api.title ?? api.id}</span>;
}

function isDockPanelId(value: string): value is WorkbenchDockPanelId {
  return dockPanelIds.includes(value as WorkbenchDockPanelId);
}
