import { createElement, useRef, useState } from "react";
import type { ShowActionNotice } from "@/app/ActionToast";
import { loadSavedQuery } from "@/app/app-config";
import { activeTabLabelForEditorGroup } from "@/app/editor-tabs";
import { selectedSqlFromSelections } from "@/app/app-workbench-utils";
import { EditorTabStrip } from "@/app/EditorTabStrip";
import type { QueryEditorController } from "@/app/controllers/workbench-controllers";
import type { useEditorCommands } from "@/app/controllers/use-editor-commands";
import { useEditorGroups } from "@/app/controllers/use-editor-groups";
import { usePreferencesStore } from "@/features/preferences";
import type {
  EditorGroup,
  EditorSelection,
  SqlEditorHandle,
} from "@/features/query-editor";
import { formatKeySequence, type Keymap } from "@/core";
import type { DatabaseMetadata, DbEngine } from "@/generated/irodori-api";
import type { IrodoriTheme } from "@/theme";
import type { useQueryRunner } from "@/app/controllers/use-query-runner";
import type { useWorkspaceActions } from "@/app/controllers/use-workspace-actions";

type EditorWorkspaceDeps = {
  keymap: Keymap;
  showActionNotice: ShowActionNotice;
  prompt: Parameters<typeof useEditorGroups>[0]["prompt"];
  t: Parameters<typeof useEditorGroups>[0]["t"];
};

// The editor surface behind one seam: editor refs and split state, tab
// groups, the active-editor accessors every other workspace hook uses, run
// labels/shortcut tips derived from the keymap, and a builder for the
// QueryEditorController consumed by QueryEditorPane.
export function useEditorWorkspace({
  keymap,
  showActionNotice,
  prompt,
  t,
}: EditorWorkspaceDeps) {
  const editorApiRef = useRef<SqlEditorHandle>(null);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const formatter = usePreferencesStore((state) => state.formatter);
  const vimMode = usePreferencesStore((state) => state.vimMode);
  const sqlLinter = usePreferencesStore((state) => state.sqlLinter);
  const sqlSnippets = usePreferencesStore((state) => state.sqlSnippets);
  const editorBackgroundImage = usePreferencesStore(
    (state) => state.editorBackgroundImage,
  );
  const editorBackgroundOpacity = usePreferencesStore(
    (state) => state.editorBackgroundOpacity,
  );

  const editorGroups = useEditorGroups({
    loadInitialQuery: loadSavedQuery,
    editorApiRef,
    showActionNotice,
    prompt,
    t,
  });
  const {
    activeEditorGroup,
    activeTabLabel,
    closeOtherSqlTabs,
    closeSqlTab,
    duplicateSqlTab,
    editorGroupStates,
    editorSelections,
    editorTabMenu,
    newSqlTab,
    openSqlInNewTab,
    showTableTab,
    primaryQuery,
    query,
    renameSqlTab,
    reopenSqlTab,
    selectEditorTab,
    setEditorGroupQuery,
    setEditorGroupSelection,
    setEditorTabMenu,
    setQuery,
  } = editorGroups;

  function activeEditorApi() {
    return editorApiRef.current;
  }

  function activeEditorSelections() {
    return activeEditorApi()?.getSelections() ?? [...editorSelections];
  }

  function activeMainEditorSelection(): EditorSelection {
    return (
      activeEditorApi()?.getSelection() ??
      editorSelections[0] ?? { from: 0, to: 0 }
    );
  }

  const selectedEditorSql = selectedSqlFromSelections(query, editorSelections);
  const hasSelectedEditorSql = selectedEditorSql.length > 0;
  const runPrimaryLabel = hasSelectedEditorSql
    ? t("editor.runSelection")
    : t("editor.runCurrent");
  const runShortcutLabel = formatKeySequence(keymap["query.run"] ?? "");
  const runCurrentShortcutLabel = formatKeySequence(
    keymap["query.runCurrent"] ?? "",
  );
  const runFromStartShortcutLabel = formatKeySequence(
    keymap["query.runFromStart"] ?? "",
  );
  const runAllShortcutLabel = formatKeySequence(keymap["query.runAll"] ?? "");
  const shortcutTip = (label: string, commandId: string) => ({
    label,
    shortcut: formatKeySequence(keymap[commandId] ?? "") || null,
  });
  const resultShortcutTips = [
    shortcutTip(t("shortcuts.newTab"), "tab.new"),
    shortcutTip(t("shortcuts.showCommands"), "palette.open"),
    shortcutTip(t("shortcuts.exportCsv"), "result.export"),
    shortcutTip(t("shortcuts.copyTsv"), "result.copyVisible"),
    shortcutTip(t("shortcuts.toggleEditData"), "edit.toggle"),
    shortcutTip(t("shortcuts.addRow"), "edit.addRow"),
    shortcutTip(t("shortcuts.undoEdit"), "edit.undo"),
    shortcutTip(t("shortcuts.commitEdits"), "edit.commit"),
  ];

  function renderEditorTabStrip(group: EditorGroup) {
    return createElement(EditorTabStrip, {
      group,
      state: editorGroupStates[group],
      menu: editorTabMenu,
      onSelectTab: selectEditorTab,
      onOpenMenu: setEditorTabMenu,
      onCloseMenu: () => setEditorTabMenu(null),
      onNewTab: newSqlTab,
      onRenameTab: renameSqlTab,
      onDuplicateTab: duplicateSqlTab,
      onCloseTab: closeSqlTab,
      onCloseOtherTabs: closeOtherSqlTabs,
      onReopenClosedTab: reopenSqlTab,
    });
  }

  function buildQueryEditorController(extra: {
    running: boolean;
    theme: IrodoriTheme;
    activeMetadata: DatabaseMetadata | undefined;
    editorEngine: DbEngine;
    runCommand: (commandId: string) => void;
    editorCommands: Pick<
      ReturnType<typeof useEditorCommands>,
      | "runQuery"
      | "runSelectionQuery"
      | "runCurrentQuery"
      | "runFromStartQuery"
      | "runAllQuery"
    >;
    workspace: Pick<
      ReturnType<typeof useWorkspaceActions>,
      "handleImportFile" | "handleLogProfileImport" | "jumpToSqlMetadata"
    >;
    cancelQuery: ReturnType<typeof useQueryRunner>["cancelQuery"];
  }): QueryEditorController {
    return {
      activeTabLabel,
      primaryTabKey: editorGroupStates.primary.activeTabId,
      primaryTabLabel: activeTabLabelForEditorGroup(editorGroupStates.primary),
      running: extra.running,
      formatter,
      primaryQuery,
      onPrimaryQueryChange: (next) => setEditorGroupQuery("primary", next),
      renderEditorTabStrip,
      onNewTab: newSqlTab,
      editorEngine: extra.editorEngine,
      activeMetadata: extra.activeMetadata,
      sqlSnippets,
      editorBackgroundImage,
      editorBackgroundOpacity,
      theme: extra.theme,
      vimMode,
      sqlLinter,
      editorApiRef,
      activeEditorGroup,
      setEditorSelection: setEditorGroupSelection,
      runPrimaryLabel,
      runShortcutLabel,
      runCurrentShortcutLabel,
      runFromStartShortcutLabel,
      runAllShortcutLabel,
      runMenuOpen,
      keymap,
      runCommand: extra.runCommand,
      runQuery: extra.editorCommands.runQuery,
      runCurrentQuery: extra.editorCommands.runCurrentQuery,
      runFromStartQuery: extra.editorCommands.runFromStartQuery,
      runAllQuery: extra.editorCommands.runAllQuery,
      cancelQuery: extra.cancelQuery,
      setRunMenuOpen,
      onSqlFileDrop: (file) => void extra.workspace.handleImportFile(file),
      onUnsupportedFileDrop: () =>
        showActionNotice(
          "error",
          t("editor.dropFailed"),
          t("editor.dropUnsupportedFile"),
        ),
      sqlFileDropLabel: t("editor.dropSqlFile"),
      onMetadataJump: extra.workspace.jumpToSqlMetadata,
      onLogProfileImport: extra.workspace.handleLogProfileImport,
    } satisfies QueryEditorController;
  }

  return {
    editorGroups,
    query,
    setQuery,
    openSqlInNewTab,
    showTableTab,
    activeTabLabel,
    editorSelections,
    runMenuOpen,
    setRunMenuOpen,
    activeEditorApi,
    activeEditorSelections,
    activeMainEditorSelection,
    resultShortcutTips,
    buildQueryEditorController,
  };
}

export type EditorWorkspace = ReturnType<typeof useEditorWorkspace>;
