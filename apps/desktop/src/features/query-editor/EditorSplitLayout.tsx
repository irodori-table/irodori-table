import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import type {
  SqlEditorHandle,
  SqlMetadataToolWindowRequest,
} from "./SqlEditor";
import { EditorGroupShell } from "./EditorGroupShell";
import type { DatabaseMetadata, DbEngine } from "../../generated/irodori-api";
import type { SqlSnippetDefinition } from "../../sql/completion";
import type { SqlFormatterId } from "../../sql/formatter";
import type { SqlLinterId } from "../../sql/linter";
import type { SqlMetadataTarget } from "../../sql/metadata-inspection";
import type { IrodoriTheme } from "@/theme";
import type { EditorGroup, EditorSelections } from "./query-editor-pane-types";
import type { LogProfileImportRequest } from "./editor-log-profile";

type EditorGroupState = {
  query: string;
  /** Stable active-tab identity, separate from the user-editable label. */
  tabKey: string;
  /** Active tab's file-style label; routes the buffer language (EDITOR-178). */
  tabLabel: string;
  apiRef: RefObject<SqlEditorHandle | null>;
  onQueryChange: (next: string) => void;
};

export type EditorContextMenuHandler = (
  event: ReactMouseEvent<HTMLDivElement>,
  group: EditorGroup,
) => void;

export type EditorSplitLayoutProps = {
  activeEditorGroup: EditorGroup;
  primary: EditorGroupState;
  formatter: SqlFormatterId;
  editorEngine: DbEngine;
  activeMetadata?: DatabaseMetadata;
  sqlSnippets: readonly SqlSnippetDefinition[];
  editorBackgroundStyle: CSSProperties | undefined;
  theme: IrodoriTheme;
  vimMode: boolean;
  sqlLinter: SqlLinterId;
  renderEditorTabStrip: (group: EditorGroup) => ReactNode;
  onNewTab: (group: EditorGroup) => void;
  setEditorSelection: (group: EditorGroup, selection: EditorSelections) => void;
  onEditorContextMenu: EditorContextMenuHandler;
  onMetadataJump?: (target: SqlMetadataTarget) => void;
  onMetadataToolWindow: (request: SqlMetadataToolWindowRequest) => void;
  onLogProfileImport?: (request: LogProfileImportRequest) => void;
};

export function EditorSplitLayout({
  activeEditorGroup,
  primary,
  formatter,
  editorEngine,
  activeMetadata,
  sqlSnippets,
  editorBackgroundStyle,
  theme,
  vimMode,
  sqlLinter,
  renderEditorTabStrip,
  onNewTab,
  setEditorSelection,
  onEditorContextMenu,
  onMetadataJump,
  onMetadataToolWindow,
  onLogProfileImport,
}: EditorSplitLayoutProps) {
  const renderEditorGroup = (group: EditorGroup, state: EditorGroupState) => (
    <EditorGroupShell
      group={group}
      active={activeEditorGroup === group}
      query={state.query}
      tabKey={state.tabKey}
      tabLabel={state.tabLabel}
      apiRef={state.apiRef}
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
      onQueryChange={state.onQueryChange}
      setEditorSelection={setEditorSelection}
      onContextMenu={onEditorContextMenu}
      onMetadataJump={onMetadataJump}
      onMetadataToolWindow={onMetadataToolWindow}
      onLogProfileImport={onLogProfileImport}
    />
  );

  return (
    <div className="editor-split editor-split-single">
      {renderEditorGroup("primary", primary)}
    </div>
  );
}
