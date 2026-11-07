import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type ReactNode,
} from "react";
import type {
  SqlEditorHandle,
  SqlMetadataToolWindowRequest,
} from "./SqlEditor";
import type { DatabaseMetadata, DbEngine } from "../../generated/irodori-api";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type { SqlSnippetDefinition } from "../../sql/completion";
import type { SqlFormatterId } from "../../sql/formatter";
import type { SqlMetadataTarget } from "../../sql/metadata-inspection";
import type { SqlLinterId } from "../../sql/linter";
import type { IrodoriTheme } from "@/theme";
import type { Keymap } from "@/core";
import { EditorCommandBar } from "./EditorCommandBar";
import { EditorContextMenu } from "./EditorContextMenu";
import { editorShellBackgroundStyle } from "./EditorGroupShell";
import { EditorSplitLayout } from "./EditorSplitLayout";
import { MetadataToolWindow } from "./MetadataToolWindow";
import { RunControl } from "./RunControl";
import { useSqlFileDrop } from "./sql-file-drop";
import type {
  EditorGroup,
  EditorSelection,
  EditorSelections,
} from "./query-editor-pane-types";
import type { LogProfileImportRequest } from "./editor-log-profile";

export type { EditorGroup, EditorSelection, EditorSelections };

export interface QueryEditorPaneProps {
  activeTabLabel: string;
  /** Per-group active tab labels; each routes its buffer's language (EDITOR-178). */
  primaryTabKey: string;
  primaryTabLabel: string;
  running: boolean;
  formatter: SqlFormatterId;
  primaryQuery: string;
  onPrimaryQueryChange: (next: string) => void;
  renderEditorTabStrip: (group: EditorGroup) => ReactNode;
  onNewTab: (group: EditorGroup) => void;
  editorEngine: DbEngine;
  activeMetadata?: DatabaseMetadata;
  sqlSnippets: readonly SqlSnippetDefinition[];
  editorBackgroundImage: string;
  editorBackgroundOpacity: number;
  theme: IrodoriTheme;
  vimMode: boolean;
  sqlLinter: SqlLinterId;
  editorApiRef: RefObject<SqlEditorHandle | null>;
  activeEditorGroup: EditorGroup;
  setEditorSelection: (group: EditorGroup, selection: EditorSelections) => void;
  runPrimaryLabel: string;
  runShortcutLabel: string;
  runCurrentShortcutLabel: string;
  runFromStartShortcutLabel: string;
  runAllShortcutLabel: string;
  runMenuOpen: boolean;
  keymap: Keymap;
  runCommand: (commandId: string) => void;
  runQuery: () => Promise<void>;
  runCurrentQuery: () => Promise<void>;
  runFromStartQuery: () => Promise<void>;
  runAllQuery: () => Promise<void>;
  cancelQuery: () => Promise<void>;
  setRunMenuOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSqlFileDrop?: (file: File) => void;
  onUnsupportedFileDrop?: () => void;
  sqlFileDropLabel?: string;
  onMetadataJump?: (target: SqlMetadataTarget) => void;
  onLogProfileImport?: (request: LogProfileImportRequest) => void;
}

export function QueryEditorPane({
  activeTabLabel,
  primaryTabKey,
  primaryTabLabel,
  running,
  formatter,
  primaryQuery,
  onPrimaryQueryChange,
  renderEditorTabStrip,
  onNewTab,
  editorEngine,
  activeMetadata,
  sqlSnippets,
  editorBackgroundImage,
  editorBackgroundOpacity,
  theme,
  vimMode,
  sqlLinter,
  editorApiRef,
  activeEditorGroup,
  setEditorSelection,
  runPrimaryLabel,
  runShortcutLabel,
  runCurrentShortcutLabel,
  runFromStartShortcutLabel,
  runAllShortcutLabel,
  runMenuOpen,
  keymap,
  runCommand,
  runQuery,
  runCurrentQuery,
  runFromStartQuery,
  runAllQuery,
  cancelQuery,
  setRunMenuOpen,
  onSqlFileDrop,
  onUnsupportedFileDrop,
  sqlFileDropLabel = "Drop .sql file to load",
  onMetadataJump,
  onLogProfileImport,
}: QueryEditorPaneProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [metadataToolWindow, setMetadataToolWindow] =
    useState<SqlMetadataToolWindowRequest | null>(null);
  const runControlRef = useRef<HTMLDivElement | null>(null);
  const editorBackgroundStyle = editorShellBackgroundStyle(
    editorBackgroundImage,
    editorBackgroundOpacity,
  );
  const activeQuery = primaryQuery;
  const { sqlFileDragOver, sqlFileDropHandlers } = useSqlFileDrop({
    onSqlFileDrop,
    onUnsupportedFileDrop,
  });

  const openEditorContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  const closeEditorContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const runContextCommand = useCallback(
    (commandId: string) => {
      setContextMenu(null);
      runCommand(commandId);
    },
    [runCommand],
  );

  const revealMetadataUsage = (selection: EditorSelection) => {
    editorApiRef.current?.revealRange(selection);
  };

  return (
    <>
      <section
        className={`editor-pane${sqlFileDragOver ? " sql-file-drag-over" : ""}`}
        data-drop-label={sqlFileDropLabel}
        aria-label={activeTabLabel}
        {...sqlFileDropHandlers}
      >
        <EditorSplitLayout
          activeEditorGroup={activeEditorGroup}
          primary={{
            query: primaryQuery,
            tabKey: primaryTabKey,
            tabLabel: primaryTabLabel,
            apiRef: editorApiRef,
            onQueryChange: onPrimaryQueryChange,
          }}
          formatter={formatter}
          editorEngine={editorEngine}
          activeMetadata={activeMetadata}
          sqlSnippets={sqlSnippets}
          editorBackgroundStyle={editorBackgroundStyle}
          theme={theme}
          vimMode={vimMode}
          sqlLinter={sqlLinter}
          renderEditorTabStrip={renderEditorTabStrip}
          onNewTab={onNewTab}
          setEditorSelection={setEditorSelection}
          onEditorContextMenu={openEditorContextMenu}
          onMetadataJump={onMetadataJump}
          onMetadataToolWindow={setMetadataToolWindow}
          onLogProfileImport={onLogProfileImport}
        />
        {metadataToolWindow ? (
          <MetadataToolWindow
            request={metadataToolWindow}
            query={activeQuery}
            onClose={() => setMetadataToolWindow(null)}
            onEdit={() => {
              onMetadataJump?.(metadataToolWindow.target);
              setMetadataToolWindow(null);
            }}
            onRevealUsage={revealMetadataUsage}
          />
        ) : null}
        {contextMenu ? (
          <EditorContextMenu
            position={contextMenu}
            runPrimaryLabel={runPrimaryLabel}
            keymap={keymap}
            onCommand={runContextCommand}
            onClose={closeEditorContextMenu}
          />
        ) : null}
      </section>
      {/* TablePlus-style: the save/run controls live at the bottom-right of
          the editor pane, next to where results appear. */}
      <div className="query-toolbar query-toolbar-bottom">
        <div className="query-toolbar-spacer" aria-hidden="true" />
        <div
          className="editor-action-dock"
          role="toolbar"
          aria-label={t("editor.queryActions")}
        >
          <EditorCommandBar
            formatter={formatter}
            running={running}
            runCommand={runCommand}
            cancelQuery={cancelQuery}
          />
          <RunControl
            running={running}
            runControlRef={runControlRef}
            runMenuOpen={runMenuOpen}
            setRunMenuOpen={setRunMenuOpen}
            runPrimaryLabel={runPrimaryLabel}
            runShortcutLabel={runShortcutLabel}
            runCurrentShortcutLabel={runCurrentShortcutLabel}
            runFromStartShortcutLabel={runFromStartShortcutLabel}
            runAllShortcutLabel={runAllShortcutLabel}
            runQuery={runQuery}
            runCurrentQuery={runCurrentQuery}
            runFromStartQuery={runFromStartQuery}
            runAllQuery={runAllQuery}
          />
        </div>
      </div>
    </>
  );
}
