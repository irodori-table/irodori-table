import { useMemo, useRef, useState } from "react";
import { tableTabId } from "@/app/editor-tabs";
import {
  isTablePreviewSql,
  supportsTableBrowse,
  tableBrowseKey,
  tablePreviewSql,
  unfilteredTable,
  type TableBrowse,
} from "@/features/workbench/object-sql";
import type { ShowActionNotice } from "@/app/ActionToast";
import { useEditorCommands } from "@/app/controllers/use-editor-commands";
import type { EditorWorkspace } from "@/app/controllers/use-editor-workspace";
import type { useErdDiagram } from "@/app/controllers/use-erd-diagram";
import { useHistoryActions } from "@/app/controllers/use-history-actions";
import { useQueryRunner } from "@/app/controllers/use-query-runner";
import { useResultGridWorkspace } from "@/app/controllers/use-result-grid-workspace";
import type { SettingsController } from "@/app/controllers/use-settings-controller";
import type { SidebarViews } from "@/app/controllers/use-sidebar-views";
import type { WorkbenchConnections } from "@/app/controllers/use-workbench-connections";
import { usePreferencesStore } from "@/features/preferences";
import { useQueryHistoryStore } from "@/features/query-history/query-history-store";
import type {
  DbObjectMetadata,
  QueryPlanAnalysis,
} from "@/generated/irodori-api";
import type { Translator } from "@/i18n";

type QueryWorkspaceDeps = {
  connections: WorkbenchConnections;
  editor: EditorWorkspace;
  sidebars: Pick<SidebarViews, "setActiveSidebarView">;
  settings: Pick<SettingsController, "queryHistoryResultRows">;
  erd: Pick<ReturnType<typeof useErdDiagram>, "openDiagramForSearch">;
  confirm: Parameters<typeof useResultGridWorkspace>[0]["confirm"];
  showActionNotice: ShowActionNotice;
  t: Translator["t"];
};

// The whole run-a-query pipeline behind one seam: the result grid, the query
// runner, editor-scoped commands, history load/run/restore, plus the query
// error and EXPLAIN-plan state they share. The long setter hand-offs between
// those four controllers stay inside this file.
export function useQueryWorkspace({
  connections,
  editor,
  sidebars,
  settings,
  erd,
  confirm,
  showActionNotice,
  t,
}: QueryWorkspaceDeps) {
  const {
    activeConnectionId,
    activeConnection,
    activeConnectionOpen,
    activeConnectionReadOnly,
    activeEngine,
    activeMetadata,
    activeMetadataLoading,
    metadataByConnection,
    setActiveConnectionId,
    editorEngine,
    connectionActions,
  } = connections;
  const { query, setQuery, activeEditorApi } = editor;
  const [tableViews, setTableViews] = useState<Record<string, TableBrowse>>({});
  const groups = editor.editorGroups;
  const activeTabId =
    groups.editorGroupStates[groups.activeEditorGroup].activeTabId;
  const activeTableObject = useMemo(() => {
    if (!activeTabId.startsWith("table:")) return null;
    const matches = activeMetadata?.schemas.flatMap((schema) =>
      schema.objects.filter(
        (object) =>
          (object.kind === "table" || object.kind === "view") &&
          tableTabId(object.schema, object.name) === activeTabId,
      ),
    );
    return matches?.length === 1 ? matches[0] : null;
  }, [activeMetadata, activeTabId]);
  const uiZoom = usePreferencesStore((state) => state.uiZoom);
  const formatter = usePreferencesStore((state) => state.formatter);
  const appendHistory = useQueryHistoryStore((state) => state.append);
  const closeQueryHistoryDialog = useQueryHistoryStore(
    (state) => state.closeDialog,
  );

  // Query error + EXPLAIN-plan state, fed by the runner, read by the results
  // pane and the plan sidebar panel.
  const [queryError, setQueryError] = useState<unknown | null>(null);
  const [planAnalysis, setPlanAnalysis] = useState<QueryPlanAnalysis | null>(
    null,
  );
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const importFileRef = useRef<HTMLInputElement | null>(null);
  // Refresh the saved table's preview, even if the editor changed.
  const refreshTableRef =
    useRef<(sql: string, table: DbObjectMetadata) => Promise<void>>(undefined);
  const grid = useResultGridWorkspace({
    uiZoom,
    editorEngine,
    activeEngine,
    activeMetadata,
    metadataByConnection,
    activeConnectionId,
    activeConnectionReadOnly,
    writeTarget: connections.activeWriteTarget,
    activeEditorApi,
    onRowSelected: () => sidebars.setActiveSidebarView("rowDetail"),
    refreshTable: async (sql, table) => {
      await refreshTableRef.current?.(sql, table);
    },
    setQueryError,
    confirm,
    showActionNotice,
    t,
  });

  const queryRunner = useQueryRunner({
    activeTableObject,
    tableViews,
    activeConnectionId,
    activeConnectionOpen,
    activeConnectionReadOnly,
    writeTarget: connections.activeWriteTarget,
    confirm,
    activeConnectionName: activeConnection.name,
    activeConnectionEngine: activeEngine,
    activeEngine,
    resultOffloadEnabled: grid.resultOffloadEnabled,
    resultMemoryBudget: grid.resultMemoryBudget,
    queryHistoryResultRows: settings.queryHistoryResultRows,
    appendHistory,
    setResult: grid.setResult,
    setQueryError,
    setLastRunSql: grid.setLastRunSql,
    setPlanAnalysis,
    setPlanLoading,
    setPlanError,
    setResultMode: grid.setResultMode,
    setTableViewObject: grid.setTableViewObject,
    setActiveResultIndex: grid.setActiveResultIndex,
    resetEdits: grid.resetEdits,
    resetGridView: grid.resetGridView,
    releaseActiveSpill: grid.releaseActiveSpill,
    gridRef: grid.gridRef,
    setGridScrollTop: grid.setGridScrollTop,
    setGridScrollLeft: grid.setGridScrollLeft,
    setSelectedRowKey: grid.setSelectedRowKey,
    setSelectedCell: grid.setSelectedCell,
    setSelectedRange: grid.setSelectedRange,
    spillRef: grid.spillRef,
    clearPendingPages: grid.clearPendingPages,
    setSpillInfo: grid.setSpillInfo,
    bumpGridWindowVersion: grid.bumpGridWindowVersion,
    refreshObjects: connectionActions.refreshObjects,
    openPlanPanel: () => sidebars.setActiveSidebarView("plan"),
    showActionNotice,
    t,
  });

  const editorCommands = useEditorCommands({
    query,
    activeResult: grid.activeResult,
    activeConnectionId,
    activeConnectionOpen,
    activeMetadata,
    activeMetadataLoading,
    formatter,
    activeEditorApi,
    activeEditorSelections: editor.activeEditorSelections,
    activeMainEditorSelection: editor.activeMainEditorSelection,
    setQuery,
    setQueryError,
    setRunMenuOpen: editor.setRunMenuOpen,
    runEditorSqlWithRunner: queryRunner.runEditorSql,
    runSqlWithParameterPrompt: queryRunner.runSqlWithParameterPrompt,
    openQueryParameterPrompt: queryRunner.openQueryParameterPrompt,
    explainSql: queryRunner.explainSql,
    refreshObjects: connectionActions.refreshObjects,
    openDiagramForSearch: erd.openDiagramForSearch,
    exportActiveResult: grid.exportActiveResult,
    showActionNotice,
    t,
  });
  refreshTableRef.current = (sql, table) =>
    queryRunner.executeQuery(sql, undefined, { sourceObject: table });

  const browseKey =
    activeTableObject && tableBrowseKey(activeConnectionId, activeTableObject);
  const databaseBrowse =
    activeConnectionOpen &&
    activeTableObject &&
    browseKey &&
    supportsTableBrowse(activeEngine) &&
    isTablePreviewSql(activeEngine, activeTableObject, query)
      ? {
          key: browseKey,
          object: activeTableObject,
          options: tableViews[browseKey] ?? unfilteredTable,
          apply: async (next: TableBrowse) => {
            setTableViews((current) => ({ ...current, [browseKey]: next }));
            await queryRunner.executeQuery(
              tablePreviewSql(activeEngine, activeTableObject),
              undefined,
              { sourceObject: activeTableObject, tableBrowse: next },
            );
          },
        }
      : undefined;

  const historyActions = useHistoryActions({
    activeConnectionId,
    setActiveConnectionId,
    setQuery,
    closeQueryHistoryDialog,
    activeEditorApi,
    runEditorSql: editorCommands.runEditorSql,
    releaseActiveSpill: grid.releaseActiveSpill,
    setResult: grid.setResult,
    setLastRunSql: grid.setLastRunSql,
    setQueryError,
    setResultMode: grid.setResultMode,
    setTableViewObject: grid.setTableViewObject,
    setActiveResultIndex: grid.setActiveResultIndex,
    resetEdits: grid.resetEdits,
    resetGridView: grid.resetGridView,
    setSelectedRowKey: grid.setSelectedRowKey,
    setSelectedCell: grid.setSelectedCell,
    setSelectedRange: grid.setSelectedRange,
    showActionNotice,
    t,
  });

  return {
    grid,
    databaseBrowse,
    queryRunner,
    editorCommands,
    historyActions,
    queryError,
    plan: { analysis: planAnalysis, loading: planLoading, error: planError },
    importFileRef,
  };
}

export type QueryWorkspace = ReturnType<typeof useQueryWorkspace>;
