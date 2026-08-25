import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { usePreferencesStore } from "@/features/preferences";
import type {
  DatabaseMetadata,
  DbObjectMetadata,
} from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";
import type {
  ConnectionDraft,
  WorkspaceConnection,
} from "@/lib/workspace-connection";
import type { WorkbenchSide, WorkbenchViewId } from "../types";
import { SidebarConnectionRail } from "./SidebarConnectionRail";
import { SidebarObjectBrowser } from "./SidebarObjectBrowser";
import { SidebarViewSwitcher } from "./SidebarViewSwitcher";

type SnapshotObject = WorkspaceConnection["objects"][number];

type SidebarProps = {
  sidebarOpen: boolean;
  side: WorkbenchSide;
  activeView: WorkbenchViewId;
  availableViews?: readonly WorkbenchViewId[];
  /** Every view assigned to this side (hidden ones included), in tab order. */
  sideViews?: readonly WorkbenchViewId[];
  hiddenViews?: Readonly<Partial<Record<WorkbenchViewId, boolean>>>;
  onMoveView?: (viewId: WorkbenchViewId, side: WorkbenchSide) => void;
  onSetViewHidden?: (viewId: WorkbenchViewId, hidden: boolean) => void;
  onReorderView?: (
    sourceId: WorkbenchViewId,
    targetId: WorkbenchViewId,
    position: "before" | "after",
  ) => void;
  showConnectionRail?: boolean;
  completionPanel: ReactNode;
  historyPanel: ReactNode;
  planPanel: ReactNode;
  biPanel: ReactNode;
  gitPanel: ReactNode;
  aiChatPanel: ReactNode;
  searchReplacePanel: ReactNode;
  rowDetailPanel: ReactNode;
  knowledgePanel: ReactNode;
  connections: WorkspaceConnection[];
  profileById: ReadonlyMap<string, ConnectionDraft>;
  connectionColorFallback: string;
  activeConnectionId: string;
  activeConnection: WorkspaceConnection;
  activeConnectionOpen: boolean;
  activeMetadata: DatabaseMetadata | undefined;
  activeMetadataLoading: boolean;
  activeMetadataError: string | undefined;
  connectedIds: ReadonlySet<string>;
  objectActionMenu: string | null;
  objectKindLabel: (object: DbObjectMetadata) => string;
  formatObjectName: (object: DbObjectMetadata) => string;
  onAddProfile: () => void;
  onOpenConnectionManager: () => void;
  onSelectConnection: (
    connection: WorkspaceConnection,
    profile: ConnectionDraft | undefined,
  ) => void;
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
  onSelectView: (viewId: WorkbenchViewId) => void;
  onCloseSidebar: () => void;
  dockResize?: boolean;
  onBeginResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeKey: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
};

export function Sidebar({
  sidebarOpen,
  side,
  activeView,
  availableViews,
  sideViews,
  hiddenViews,
  onMoveView,
  onSetViewHidden,
  onReorderView,
  showConnectionRail,
  completionPanel,
  historyPanel,
  planPanel,
  biPanel,
  gitPanel,
  aiChatPanel,
  searchReplacePanel,
  rowDetailPanel,
  knowledgePanel,
  connections,
  profileById,
  connectionColorFallback,
  activeConnectionId,
  activeConnection,
  activeConnectionOpen,
  activeMetadata,
  activeMetadataLoading,
  activeMetadataError,
  connectedIds,
  objectActionMenu,
  objectKindLabel,
  formatObjectName,
  onAddProfile,
  onOpenConnectionManager,
  onSelectConnection,
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
  onSelectView,
  onCloseSidebar,
  dockResize = false,
  onBeginResize,
  onResizeKey,
}: SidebarProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);

  function renderActivePanel() {
    switch (activeView) {
      case "completion":
        return completionPanel;
      case "queryHistory":
        return historyPanel;
      case "plan":
        return planPanel;
      case "bi":
        return biPanel;
      case "git":
        return gitPanel;
      case "aiChat":
        return aiChatPanel;
      case "searchReplace":
        return searchReplacePanel;
      case "rowDetail":
        return rowDetailPanel;
      case "knowledge":
        return knowledgePanel;
      case "objectBrowser":
        return null;
    }
  }

  return (
    <>
      <SidebarConnectionRail
        show={showConnectionRail !== false}
        connections={connections}
        profileById={profileById}
        connectionColorFallback={connectionColorFallback}
        activeConnectionId={activeConnectionId}
        activeConnectionOpen={activeConnectionOpen}
        connectedIds={connectedIds}
        onAddProfile={onAddProfile}
        onOpenConnectionManager={onOpenConnectionManager}
        onSelectConnection={onSelectConnection}
        onRefreshObjects={onRefreshObjects}
      />
      {sidebarOpen ? (
        <aside className={`sidebar sidebar-${side}`}>
          <SidebarViewSwitcher
            side={side}
            activeView={activeView}
            availableViews={availableViews}
            sideViews={sideViews}
            hiddenViews={hiddenViews}
            onMoveView={onMoveView}
            onSetViewHidden={onSetViewHidden}
            onReorderView={onReorderView}
            onSelectView={onSelectView}
          />
          {activeView === "objectBrowser" ? (
            <SidebarObjectBrowser
              connectionsCount={connections.length}
              activeConnection={activeConnection}
              activeConnectionOpen={activeConnectionOpen}
              activeMetadata={activeMetadata}
              activeMetadataLoading={activeMetadataLoading}
              activeMetadataError={activeMetadataError}
              objectActionMenu={objectActionMenu}
              objectKindLabel={objectKindLabel}
              formatObjectName={formatObjectName}
              onAddProfile={onAddProfile}
              onOpenConnectionManager={onOpenConnectionManager}
              onOpenBlankSchemaDesigner={onOpenBlankSchemaDesigner}
              onNewTableFromFile={onNewTableFromFile}
              onOpenObjectSchemaDesigner={onOpenObjectSchemaDesigner}
              onOpenDiagram={onOpenDiagram}
              onOpenSchemaDiagram={onOpenSchemaDiagram}
              onRefreshObjects={onRefreshObjects}
              onOpenTableData={onOpenTableData}
              onOpenSnapshotObject={onOpenSnapshotObject}
              onShowObjectInDiagram={onShowObjectInDiagram}
              onSetObjectActionMenu={onSetObjectActionMenu}
              onCloseSidebar={onCloseSidebar}
            />
          ) : (
            <div className="sidebar-panel">{renderActivePanel()}</div>
          )}
          {!dockResize ? (
            <div
              className="panel-resizer sidebar-resizer"
              role="separator"
              aria-label={t("sidebar.resize")}
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={onBeginResize}
              onKeyDown={onResizeKey}
            />
          ) : null}
        </aside>
      ) : null}
    </>
  );
}
