import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  popoverSurfaceStyle,
  usePopoverPosition,
  type PopoverAnchor,
  type PopoverRect,
} from "@/components/popover";
import {
  AlertTriangle,
  Boxes,
  Columns3,
  Folder,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Table2,
  TerminalSquare,
  X,
} from "lucide-react";
import { hasDiagram } from "@/features/erd";
import { usePreferencesStore } from "@/features/preferences";
import type {
  DatabaseMetadata,
  DbObjectMetadata,
} from "@/generated/irodori-api";
import { createTranslator, type TranslationKey } from "@/i18n";
import type { WorkspaceConnection } from "@/lib/workspace-connection";

type SnapshotObject = WorkspaceConnection["objects"][number];
type ObjectActionMenuPosition = {
  key: string;
  anchor: PopoverAnchor;
} | null;

const containerLabelKeyByEngine: Record<string, TranslationKey> = {
  duckdb: "sidebar.namespacesCount",
  motherduck: "sidebar.namespacesCount",
  iceberg: "sidebar.namespacesCount",
  s3Tables: "sidebar.namespacesCount",
  deltaLake: "sidebar.namespacesCount",
  hudi: "sidebar.namespacesCount",
  hive: "sidebar.databasesCount",
  athena: "sidebar.databasesCount",
};

const namespaceBrowserEngines: ReadonlySet<string> = new Set([
  ...Object.keys(containerLabelKeyByEngine),
  "databricks",
]);

const TREE_ROW_SELECTOR =
  ".schema-tree > summary, .object-tree > summary, .metadata-row, .object-row";

// Keep native details/summary toggling, and add conventional tree movement.
function handleTreeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
  const { key } = event;
  if (
    key !== "ArrowDown" &&
    key !== "ArrowUp" &&
    key !== "ArrowLeft" &&
    key !== "ArrowRight" &&
    key !== "Home" &&
    key !== "End"
  ) {
    return;
  }
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(TREE_ROW_SELECTOR),
  ).filter((row) => row.offsetParent !== null);
  if (rows.length === 0) {
    return;
  }
  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>(TREE_ROW_SELECTOR)
      : null;
  const currentIndex = active ? rows.indexOf(active) : -1;
  const focusRow = (index: number) => {
    rows[Math.max(0, Math.min(index, rows.length - 1))]?.focus();
  };
  event.preventDefault();
  event.stopPropagation();
  if (key === "Home") {
    focusRow(0);
    return;
  }
  if (key === "End") {
    focusRow(rows.length - 1);
    return;
  }
  if (key === "ArrowDown") {
    focusRow(currentIndex + 1);
    return;
  }
  if (key === "ArrowUp") {
    focusRow(currentIndex <= 0 ? 0 : currentIndex - 1);
    return;
  }
  if (!active) {
    focusRow(0);
    return;
  }
  const details =
    active.tagName === "SUMMARY"
      ? (active.parentElement as HTMLDetailsElement | null)
      : null;
  if (key === "ArrowRight") {
    if (details && !details.open) {
      details.open = true;
    } else {
      focusRow(currentIndex + 1);
    }
    return;
  }
  if (details?.open) {
    details.open = false;
    return;
  }
  const owner =
    active.tagName === "SUMMARY"
      ? active
          .closest("details")
          ?.parentElement?.closest("details")
          ?.querySelector<HTMLElement>(":scope > summary")
      : active
          .closest("details")
          ?.querySelector<HTMLElement>(":scope > summary");
  owner?.focus();
}

type SidebarObjectBrowserProps = {
  connectionsCount: number;
  activeConnection: WorkspaceConnection;
  activeConnectionOpen: boolean;
  activeMetadata: DatabaseMetadata | undefined;
  activeMetadataLoading: boolean;
  activeMetadataError: string | undefined;
  objectActionMenu: string | null;
  objectKindLabel: (object: DbObjectMetadata) => string;
  formatObjectName: (object: DbObjectMetadata) => string;
  onAddProfile: () => void;
  onOpenConnectionManager: () => void;
  onOpenBlankSchemaDesigner: () => void;
  onNewTableFromFile: () => void;
  onOpenObjectSchemaDesigner: (object: DbObjectMetadata) => void;
  onOpenDiagram: () => void;
  onOpenSchemaDiagram: () => void;
  onRefreshObjects: () => void;
  onOpenTableData: (object: DbObjectMetadata) => void;
  onOpenSnapshotObject: (object: SnapshotObject) => void;
  onShowObjectInDiagram: (object: DbObjectMetadata) => void;
  onSetObjectActionMenu: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  onCloseSidebar: () => void;
};

export function SidebarObjectBrowser({
  connectionsCount,
  activeConnection,
  activeConnectionOpen,
  activeMetadata,
  activeMetadataLoading,
  activeMetadataError,
  objectActionMenu,
  objectKindLabel,
  formatObjectName,
  onAddProfile,
  onOpenConnectionManager,
  onOpenBlankSchemaDesigner,
  onNewTableFromFile,
  onOpenObjectSchemaDesigner,
  onOpenDiagram,
  onOpenSchemaDiagram,
  onRefreshObjects,
  onOpenTableData,
  onOpenSnapshotObject,
  onShowObjectInDiagram,
  onSetObjectActionMenu,
  onCloseSidebar,
}: SidebarObjectBrowserProps) {
  const [objectActionMenuPosition, setObjectActionMenuPosition] =
    useState<ObjectActionMenuPosition>(null);
  const createMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const [createMenu, setCreateMenu] = useState<PopoverRect | null>(null);
  const objectMenu = usePopoverPosition<HTMLDivElement>(
    objectActionMenuPosition?.anchor ?? null,
  );
  const objectActionMenuRef = objectMenu.ref;
  const createMenuPopover = usePopoverPosition<HTMLDivElement>(
    createMenu ? { at: "element", rect: createMenu, align: "end" } : null,
  );
  const createMenuRef = createMenuPopover.ref;
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const containerLabelKey =
    containerLabelKeyByEngine[activeConnection.engine] ??
    "sidebar.schemasCount";

  useEffect(() => {
    if (!objectActionMenu) {
      setObjectActionMenuPosition(null);
    }
  }, [objectActionMenu]);

  useEffect(() => {
    if (!createMenu) {
      return;
    }
    const close = () => setCreateMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (createMenuRef.current?.contains(target) ||
          createMenuAnchorRef.current?.contains(target))
      ) {
        return;
      }
      close();
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnPointerDown);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnPointerDown);
    };
  }, [createMenu]);

  useEffect(() => {
    if (!objectActionMenu) {
      return;
    }
    const close = () => onSetObjectActionMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".object-menu-button")) {
        return;
      }
      if (
        target instanceof Node &&
        objectActionMenuRef.current?.contains(target)
      ) {
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
  }, [objectActionMenu, onSetObjectActionMenu]);

  function openObjectContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    objectKey: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSetObjectActionMenu(objectKey);
    setObjectActionMenuPosition({
      key: objectKey,
      anchor: { at: "pointer", x: event.clientX, y: event.clientY },
    });
  }

  function toggleObjectActionMenu(
    event: ReactMouseEvent<HTMLElement>,
    objectKey: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onSetObjectActionMenu((current) =>
      current === objectKey ? null : objectKey,
    );
    setObjectActionMenuPosition({
      key: objectKey,
      anchor: { at: "element", rect, align: "end" },
    });
  }

  return (
    <section className="sidebar-section browser-section">
      <div className="section-heading">
        <span>
          {activeMetadata
            ? t(containerLabelKey, { count: activeMetadata.schemas.length })
            : t("sidebar.databaseObjects")}
        </span>
        <div className="section-heading-actions">
          <div className="schema-create-menu-wrap" ref={createMenuAnchorRef}>
            <button
              type="button"
              title={t("sidebar.newTable")}
              aria-label={t("sidebar.newTable")}
              aria-expanded={Boolean(createMenu)}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setCreateMenu((open) => (open ? null : rect));
              }}
            >
              <Plus size={14} />
            </button>
            {createMenu
              ? createPortal(
                  <div
                    ref={createMenuRef}
                    className="schema-create-menu"
                    role="menu"
                    style={{
                      ...popoverSurfaceStyle,
                      ...createMenuPopover.style,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenu(null);
                        onOpenBlankSchemaDesigner();
                      }}
                    >
                      {t("sidebar.menu.newTable")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenu(null);
                        onNewTableFromFile();
                      }}
                    >
                      {t("sidebar.menu.newTableFromFile")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenu(null);
                        onOpenSchemaDiagram();
                      }}
                    >
                      {t("sidebar.menu.designOnCanvas")}
                    </button>
                  </div>,
                  document.body,
                )
              : null}
          </div>
          <button
            type="button"
            title={t("erd.title")}
            aria-label={t("erd.title")}
            disabled={!hasDiagram(activeMetadata)}
            onClick={onOpenDiagram}
          >
            <Network size={14} />
          </button>
          <button
            type="button"
            title={t("sidebar.refreshObjects")}
            aria-label={t("sidebar.refreshObjects")}
            disabled={!activeConnectionOpen || activeMetadataLoading}
            onClick={onRefreshObjects}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            title={t("sidebar.close")}
            aria-label={t("sidebar.close")}
            onClick={onCloseSidebar}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div
        className="object-browser"
        aria-label={t("sidebar.databaseObjects")}
        onKeyDown={handleTreeKeyDown}
      >
        {activeMetadataLoading ? (
          <div
            className="metadata-skeleton"
            role="status"
            aria-label={t("sidebar.loadingObjects")}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : activeMetadataError ? (
          <div className="inline-error browser-error">
            <AlertTriangle size={13} />
            <span>{activeMetadataError}</span>
          </div>
        ) : activeMetadata ? (
          activeMetadata.schemas.length > 0 ? (
            activeMetadata.schemas.map((schema) => (
              <details className="schema-tree" key={schema.name} open>
                <summary>
                  {namespaceBrowserEngines.has(activeConnection.engine) ? (
                    <Boxes size={14} />
                  ) : (
                    <Folder size={14} />
                  )}
                  <span>{schema.name}</span>
                  <small>{schema.objects.length}</small>
                </summary>
                {schema.objects.map((object) => {
                  const objectKey = `${object.schema}.${object.name}`;
                  const canOpenData =
                    object.kind === "table" || object.kind === "view";
                  return (
                    <details className="object-tree" key={objectKey}>
                      <summary
                        onContextMenu={(event) =>
                          openObjectContextMenu(event, objectKey)
                        }
                      >
                        {object.kind === "procedure" ||
                        object.kind === "function" ? (
                          <TerminalSquare size={15} />
                        ) : (
                          <Table2 size={15} />
                        )}
                        <button
                          className="object-name-button"
                          type="button"
                          disabled={!canOpenData}
                          title={
                            canOpenData
                              ? t("sidebar.openObject", {
                                  name: formatObjectName(object),
                                })
                              : objectKindLabel(object)
                          }
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenTableData(object);
                          }}
                        >
                          {object.name}
                        </button>
                        <small>
                          {objectKindLabel(object)} · {object.columns.length}
                        </small>
                        <button
                          className="object-menu-button"
                          type="button"
                          title={t("sidebar.objectActions")}
                          aria-label={t("sidebar.objectActionsFor", {
                            name: object.name,
                          })}
                          onClick={(event) =>
                            toggleObjectActionMenu(event, objectKey)
                          }
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {objectActionMenu === objectKey &&
                        objectActionMenuPosition?.key === objectKey
                          ? createPortal(
                              <div
                                ref={objectActionMenuRef}
                                className="object-action-menu"
                                role="menu"
                                style={{
                                  ...popoverSurfaceStyle,
                                  ...objectMenu.style,
                                }}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={!canOpenData}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onOpenTableData(object);
                                  }}
                                >
                                  {t("sidebar.menu.openData")}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={object.kind !== "table"}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onOpenObjectSchemaDesigner(object);
                                    onSetObjectActionMenu(null);
                                  }}
                                >
                                  {t("sidebar.menu.structure")}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={!hasDiagram(activeMetadata)}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onShowObjectInDiagram(object);
                                  }}
                                >
                                  {t("sidebar.menu.showInErd")}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void navigator.clipboard?.writeText(
                                      formatObjectName(object),
                                    );
                                    onSetObjectActionMenu(null);
                                  }}
                                >
                                  {t("sidebar.menu.copyName")}
                                </button>
                              </div>,
                              document.body,
                            )
                          : null}
                      </summary>
                      <div className="metadata-children">
                        {object.columns.length > 0 ? (
                          object.columns.map((column) => (
                            <button
                              className="metadata-row field-row"
                              key={`${object.schema}.${object.name}.${column.name}`}
                              type="button"
                              title={`${column.name}: ${column.dataType}`}
                            >
                              <Columns3 size={13} />
                              <span>{column.name}</span>
                              <small>
                                {column.dataType}
                                {column.nullable ? "" : " not null"}
                              </small>
                            </button>
                          ))
                        ) : (
                          <div className="metadata-empty">
                            {t("sidebar.noFields")}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </details>
            ))
          ) : (
            <div className="empty-browser-cta">
              <p>{t("sidebar.empty.databaseEmpty")}</p>
              <button
                type="button"
                className="text-button primary"
                onClick={onOpenBlankSchemaDesigner}
              >
                {t("sidebar.empty.createTable")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={onNewTableFromFile}
              >
                {t("sidebar.empty.importFromFile")}
              </button>
              <small>{t("sidebar.empty.editorHint")}</small>
            </div>
          )
        ) : activeConnection.objects.length > 0 ? (
          activeConnection.objects.map((object) => (
            <button
              className="object-row"
              key={object.name}
              type="button"
              aria-label={object.name}
              title={object.name}
              onClick={() => onOpenSnapshotObject(object)}
            >
              {object.kind === "procedure" ? (
                <TerminalSquare size={15} />
              ) : (
                <Table2 size={15} />
              )}
              <span>{object.name}</span>
              <small>{object.rows ?? object.kind}</small>
            </button>
          ))
        ) : !activeConnectionOpen ? (
          <div className="empty-browser-cta">
            <p>{t("sidebar.empty.notConnected")}</p>
            {connectionsCount > 0 ? (
              <button
                type="button"
                className="text-button primary"
                onClick={onOpenConnectionManager}
              >
                {t("sidebar.empty.openConnection")}
              </button>
            ) : null}
            <button
              type="button"
              className={
                connectionsCount > 0 ? "text-button" : "text-button primary"
              }
              onClick={onAddProfile}
            >
              {t("sidebar.empty.addConnection")}
            </button>
          </div>
        ) : (
          <div className="empty-browser">{t("sidebar.noObjectsLoaded")}</div>
        )}
      </div>
    </section>
  );
}
