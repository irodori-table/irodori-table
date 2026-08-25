import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  popoverSurfaceStyle,
  usePopoverPosition,
  type PopoverAnchor,
} from "@/components/popover";
import {
  BarChart3,
  BookOpen,
  Bot,
  Check,
  Flame,
  GitBranch,
  History,
  ListPlus,
  Search,
  Table2,
  TableProperties,
  type LucideIcon,
} from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type TranslationKey } from "@/i18n";
import { workbenchViewIds } from "../types";
import type { WorkbenchSide, WorkbenchViewId } from "../types";

type ViewTabMeta = {
  icon: LucideIcon;
  title: TranslationKey;
  label: TranslationKey;
};

const viewTabMeta: Record<WorkbenchViewId, ViewTabMeta> = {
  objectBrowser: {
    icon: Table2,
    title: "sidebar.view.tables",
    label: "sidebar.view.tables",
  },
  completion: {
    icon: ListPlus,
    title: "sidebar.view.completion",
    label: "sidebar.view.completion",
  },
  queryHistory: {
    icon: History,
    title: "sidebar.view.history",
    label: "sidebar.view.history",
  },
  plan: { icon: Flame, title: "sidebar.view.plan", label: "sidebar.view.plan" },
  bi: { icon: BarChart3, title: "sidebar.view.bi", label: "sidebar.view.bi" },
  git: {
    icon: GitBranch,
    title: "sidebar.view.git",
    label: "sidebar.view.git",
  },
  aiChat: { icon: Bot, title: "ai.chat.title", label: "sidebar.view.chat" },
  searchReplace: {
    icon: Search,
    title: "sidebar.view.searchReplace",
    label: "sidebar.view.find",
  },
  rowDetail: {
    icon: TableProperties,
    title: "sidebar.view.rowDetail",
    label: "sidebar.view.rowDetail",
  },
  knowledge: {
    icon: BookOpen,
    title: "sidebar.view.knowledge",
    label: "sidebar.view.knowledge",
  },
};

// The typed entry identifies cross-sidebar docking while text/plain remains
// available for legacy reorder and accessibility behavior.
const VIEW_DND_MIME = "application/x-irodori-view";

type SidebarViewSwitcherProps = {
  side: WorkbenchSide;
  activeView: WorkbenchViewId;
  availableViews?: readonly WorkbenchViewId[];
  sideViews?: readonly WorkbenchViewId[];
  hiddenViews?: Readonly<Partial<Record<WorkbenchViewId, boolean>>>;
  onMoveView?: (viewId: WorkbenchViewId, side: WorkbenchSide) => void;
  onSetViewHidden?: (viewId: WorkbenchViewId, hidden: boolean) => void;
  onReorderView?: (
    sourceId: WorkbenchViewId,
    targetId: WorkbenchViewId,
    position: "before" | "after",
  ) => void;
  onSelectView: (viewId: WorkbenchViewId) => void;
};

export function SidebarViewSwitcher({
  side,
  activeView,
  availableViews,
  sideViews,
  hiddenViews,
  onMoveView,
  onSetViewHidden,
  onReorderView,
  onSelectView,
}: SidebarViewSwitcherProps) {
  const [viewMenu, setViewMenu] = useState<{
    id: WorkbenchViewId;
    anchor: PopoverAnchor;
  } | null>(null);
  const viewMenuPopover = usePopoverPosition<HTMLDivElement>(
    viewMenu?.anchor ?? null,
  );
  const viewMenuRef = viewMenuPopover.ref;
  const draggedViewRef = useRef<WorkbenchViewId | null>(null);
  const [viewDragOver, setViewDragOver] = useState<{
    id: WorkbenchViewId;
    position: "before" | "after";
  } | null>(null);
  const [sideDropActive, setSideDropActive] = useState(false);
  const locale = usePreferencesStore((state) => state.locale);
  const sidebarViewLabels = usePreferencesStore(
    (state) => state.sidebarViewLabels,
  );
  const { t } = createTranslator(locale);

  useEffect(() => {
    if (!viewMenu) {
      return;
    }
    const close = () => setViewMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && viewMenuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [viewMenu]);

  function openViewMenu(
    event: ReactMouseEvent<HTMLElement>,
    viewId: WorkbenchViewId,
  ) {
    if (!onSetViewHidden && !onMoveView) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setViewMenu({
      id: viewId,
      anchor: { at: "pointer", x: event.clientX, y: event.clientY },
    });
  }

  function handleViewDragStart(
    event: ReactDragEvent<HTMLButtonElement>,
    viewId: WorkbenchViewId,
  ) {
    draggedViewRef.current = viewId;
    event.dataTransfer.setData("text/plain", viewId);
    event.dataTransfer.setData(VIEW_DND_MIME, viewId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleViewDragOver(
    event: ReactDragEvent<HTMLButtonElement>,
    viewId: WorkbenchViewId,
  ) {
    const source = draggedViewRef.current;
    if (!onReorderView || !source || source === viewId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position =
      event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setViewDragOver((current) =>
      current?.id === viewId && current.position === position
        ? current
        : { id: viewId, position },
    );
  }

  function handleViewDrop(
    event: ReactDragEvent<HTMLButtonElement>,
    viewId: WorkbenchViewId,
  ) {
    const source = draggedViewRef.current;
    if (!onReorderView || !source || source === viewId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const position =
      event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    onReorderView(source, viewId, position);
    draggedViewRef.current = null;
    setViewDragOver(null);
  }

  function handleViewDragEnd() {
    draggedViewRef.current = null;
    setViewDragOver(null);
    setSideDropActive(false);
  }

  function isForeignViewDrag(event: ReactDragEvent<HTMLDivElement>) {
    return (
      Boolean(onMoveView) &&
      draggedViewRef.current === null &&
      Array.from(event.dataTransfer.types).includes(VIEW_DND_MIME)
    );
  }

  function handleStripDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!isForeignViewDrag(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setSideDropActive(true);
  }

  function handleStripDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setSideDropActive(false);
  }

  function handleStripDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (draggedViewRef.current !== null || !onMoveView) {
      setSideDropActive(false);
      return;
    }
    const dropped = event.dataTransfer.getData(VIEW_DND_MIME);
    setSideDropActive(false);
    if (!workbenchViewIds.includes(dropped as WorkbenchViewId)) {
      return;
    }
    event.preventDefault();
    onMoveView(dropped as WorkbenchViewId, side);
  }

  const tabViews = availableViews ?? workbenchViewIds;
  const manageableViews = sideViews ?? tabViews;
  const canManageViews = Boolean(onSetViewHidden || onMoveView);

  return (
    <>
      <div
        className={`sidebar-view-switcher${
          sideDropActive ? " side-drop-active" : ""
        }`}
        role="tablist"
        aria-label={t("sidebar.views")}
        onDragOver={onMoveView ? handleStripDragOver : undefined}
        onDragLeave={onMoveView ? handleStripDragLeave : undefined}
        onDrop={onMoveView ? handleStripDrop : undefined}
      >
        {tabViews.map((viewId) => {
          const meta = viewTabMeta[viewId];
          const TabIcon = meta.icon;
          const dragClass =
            viewDragOver?.id === viewId
              ? ` drag-over-${viewDragOver.position}`
              : "";
          return (
            <button
              key={viewId}
              type="button"
              role="tab"
              className={
                `${activeView === viewId ? "active" : ""}${dragClass}`.trim() ||
                undefined
              }
              aria-selected={activeView === viewId}
              title={t(meta.title)}
              aria-label={t(meta.title)}
              draggable={Boolean(onReorderView)}
              onClick={() => onSelectView(viewId)}
              onContextMenu={(event) => openViewMenu(event, viewId)}
              onDragStart={(event) => handleViewDragStart(event, viewId)}
              onDragOver={(event) => handleViewDragOver(event, viewId)}
              onDrop={(event) => handleViewDrop(event, viewId)}
              onDragEnd={handleViewDragEnd}
            >
              <TabIcon size={14} />
              {sidebarViewLabels ? <span>{t(meta.label)}</span> : null}
            </button>
          );
        })}
      </div>
      {viewMenu && canManageViews
        ? createPortal(
            <div
              ref={viewMenuRef}
              className="object-action-menu"
              role="menu"
              aria-label={t("sidebar.viewMenu")}
              style={{ ...popoverSurfaceStyle, ...viewMenuPopover.style }}
            >
              {onMoveView ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={viewMenu.id === "objectBrowser"}
                  onClick={() => {
                    onMoveView(viewMenu.id, side === "left" ? "right" : "left");
                    setViewMenu(null);
                  }}
                >
                  {side === "left"
                    ? t("sidebar.menu.moveToRightSidebar")
                    : t("sidebar.menu.moveToLeftSidebar")}
                </button>
              ) : null}
              {onSetViewHidden ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={viewMenu.id === "objectBrowser"}
                  onClick={() => {
                    onSetViewHidden(viewMenu.id, true);
                    setViewMenu(null);
                  }}
                >
                  {t("sidebar.menu.hideView", {
                    name: t(viewTabMeta[viewMenu.id].title),
                  })}
                </button>
              ) : null}
              {onSetViewHidden ? (
                <>
                  <span className="menu-separator" aria-hidden="true" />
                  {manageableViews.map((viewId) => {
                    const visible = !hiddenViews?.[viewId];
                    return (
                      <button
                        key={viewId}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={visible}
                        disabled={viewId === "objectBrowser"}
                        onClick={() => {
                          onSetViewHidden(viewId, visible);
                          setViewMenu(null);
                        }}
                      >
                        <span>{t(viewTabMeta[viewId].title)}</span>
                        {visible ? <Check size={13} /> : null}
                      </button>
                    );
                  })}
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
