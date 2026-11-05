import type { ReactNode } from "react";
import type {
  DatabaseMetadata,
  DbObjectMetadata,
} from "@/generated/irodori-api";
import type {
  ConnectionDraft,
  WorkspaceConnection,
} from "@/lib/workspace-connection";
import type { WorkbenchSide, WorkbenchViewId } from "../types";
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
  completionPanel: ReactNode;
  historyPanel: ReactNode;
  planPanel: ReactNode;
  biPanel: ReactNode;
  gitPanel: ReactNode;
  aiChatPanel: ReactNode;
  searchReplacePanel: ReactNode;
  rowDetailPanel: ReactNode;
  knowledgePanel: ReactNode;
  profileById: ReadonlyMap<string, ConnectionDraft>;
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
  onCreateDatabase: () => void;
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
  completionPanel,
  historyPanel,
  planPanel,
  biPanel,
  gitPanel,
  aiChatPanel,
  searchReplacePanel,
  rowDetailPanel,
  knowledgePanel,
  profileById,
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
  onCreateDatabase,
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
}: SidebarProps) {
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
              savedConnectionsCount={profileById.size}
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
              onCreateDatabase={onCreateDatabase}
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
        </aside>
      ) : null}
    </>
  );
}
