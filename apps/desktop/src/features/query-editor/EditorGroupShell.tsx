import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import SqlEditor, {
  type SqlEditorHandle,
  type SqlMetadataToolWindowRequest,
} from "./SqlEditor";
import { LogFilterBar } from "./LogFilterBar";
import { LogMarksBar } from "./LogMarksBar";
import { LogProfileBar } from "./LogProfileBar";
import {
  emptyLogMarks,
  loadLogMarks,
  logMarksEqual,
  pruneLogMarks,
  saveLogMarks,
  toggleLogMark,
  type LogMarkColor,
  type LogMarks,
} from "./editor-log-marks";
import {
  computeLogFilterRanges,
  emptyLogFilter,
  isLogFilterActive,
  logFilterSpecsEqual,
  splitLogFilterLines,
  type LogFilterSpec,
} from "./editor-log-filter";
import {
  type LogProfileId,
  type LogProfileImportRequest,
} from "./editor-log-profile";
import { editorLanguageForTabLabel } from "@/lib/editor-language";
import type { DatabaseMetadata, DbEngine } from "../../generated/irodori-api";
import type { SqlSnippetDefinition } from "../../sql/completion";
import type { SqlFormatterId } from "../../sql/formatter";
import type { SqlLinterId } from "../../sql/linter";
import type { SqlMetadataTarget } from "../../sql/metadata-inspection";
import type { IrodoriTheme } from "@/theme";
import type { EditorGroup, EditorSelections } from "./query-editor-pane-types";

export type EditorGroupShellProps = {
  group: EditorGroup;
  active: boolean;
  query: string;
  /** Stable active-tab identity; labels alone can collide across tabs. */
  tabKey: string;
  /** Active tab's file-style label; routes the buffer language (EDITOR-178). */
  tabLabel: string;
  apiRef: RefObject<SqlEditorHandle | null>;
  formatter: SqlFormatterId;
  editorEngine: DbEngine;
  activeMetadata?: DatabaseMetadata;
  sqlSnippets: readonly SqlSnippetDefinition[];
  editorBackgroundStyle: CSSProperties | undefined;
  theme: IrodoriTheme;
  vimMode: boolean;
  sqlLinter: SqlLinterId;
  renderEditorTabStrip: (group: EditorGroup) => ReactNode;
  onQueryChange: (next: string) => void;
  setActiveEditorGroup: (group: EditorGroup) => void;
  setEditorSelection: (group: EditorGroup, selection: EditorSelections) => void;
  onContextMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    group: EditorGroup,
  ) => void;
  onMetadataJump?: (target: SqlMetadataTarget) => void;
  onMetadataToolWindow: (request: SqlMetadataToolWindowRequest) => void;
  onLogProfileImport?: (request: LogProfileImportRequest) => void;
};

export function EditorGroupShell({
  group,
  active,
  query,
  tabKey,
  tabLabel,
  apiRef,
  formatter,
  editorEngine,
  activeMetadata,
  sqlSnippets,
  editorBackgroundStyle,
  theme,
  vimMode,
  sqlLinter,
  renderEditorTabStrip,
  onQueryChange,
  setActiveEditorGroup,
  setEditorSelection,
  onContextMenu,
  onMetadataJump,
  onMetadataToolWindow,
  onLogProfileImport,
}: EditorGroupShellProps) {
  const language = editorLanguageForTabLabel(tabLabel);

  // Log filters are session-only but belong to a buffer, not an editor group.
  // Keeping a small keyed map means switching tabs can never apply one file's
  // filter to another, while returning to a tab restores its working context.
  // Include the label so renaming a tab to/from `.log` starts with a clean view.
  const logBufferKey = `${tabKey}\u0000${tabLabel}`;
  const [logFiltersByBuffer, setLogFiltersByBuffer] = useState<
    ReadonlyMap<string, LogFilterSpec>
  >(() => new Map());
  const logFilter =
    language === "log"
      ? (logFiltersByBuffer.get(logBufferKey) ?? emptyLogFilter)
      : emptyLogFilter;
  const setLogFilter = useCallback(
    (next: LogFilterSpec) => {
      setLogFiltersByBuffer((current) => {
        const previous = current.get(logBufferKey) ?? emptyLogFilter;
        if (logFilterSpecsEqual(previous, next)) {
          return current;
        }
        const updated = new Map(current);
        if (isLogFilterActive(next)) {
          updated.set(logBufferKey, next);
        } else {
          updated.delete(logBufferKey);
        }
        return updated;
      });
    },
    [logBufferKey],
  );

  // Profile choice is session-only and follows the same stable buffer
  // identity as filtering. Auto is the default and therefore needs no map
  // entry, keeping tab churn from accumulating redundant state.
  const [logProfilesByBuffer, setLogProfilesByBuffer] = useState<
    ReadonlyMap<string, LogProfileId>
  >(() => new Map());
  const logProfile = logProfilesByBuffer.get(logBufferKey) ?? "auto";
  const setLogProfile = useCallback(
    (next: LogProfileId) => {
      setLogProfilesByBuffer((current) => {
        if ((current.get(logBufferKey) ?? "auto") === next) {
          return current;
        }
        const updated = new Map(current);
        if (next === "auto") {
          updated.delete(logBufferKey);
        } else {
          updated.set(logBufferKey, next);
        }
        return updated;
      });
    },
    [logBufferKey],
  );

  // Marks are persistent per file-style label (#177 tier 3). Cache loaded
  // values by that identity so tab switches are synchronous and never require
  // a render-time state update.
  const [logMarksByFile, setLogMarksByFile] = useState<
    ReadonlyMap<string, LogMarks>
  >(() => new Map());
  const storedLogMarks = useMemo(
    () => (language === "log" ? loadLogMarks(tabLabel) : emptyLogMarks),
    [language, tabLabel],
  );
  const logMarks =
    language === "log"
      ? (logMarksByFile.get(tabLabel) ?? storedLogMarks)
      : emptyLogMarks;
  const [markColor, setMarkColor] = useState<LogMarkColor>("amber");
  const persistMarks = useCallback(
    (next: LogMarks) => {
      setLogMarksByFile((current) => {
        const previous = current.get(tabLabel) ?? storedLogMarks;
        if (logMarksEqual(previous, next)) {
          return current;
        }
        const updated = new Map(current);
        // Keep an explicit empty entry. Deleting it would fall back to the
        // memoized pre-clear storage snapshot during this render cycle.
        updated.set(tabLabel, next);
        return updated;
      });
      saveLogMarks(tabLabel, next);
    },
    [storedLogMarks, tabLabel],
  );

  // A log re-read after truncation can be shorter than when it was marked; drop
  // marks past the end so the list cannot point at lines that no longer exist.
  const lineCount = useMemo(
    () => (language === "log" ? splitLogFilterLines(query).length : 0),
    [language, query],
  );
  const visibleMarks = useMemo(
    () =>
      language === "log" ? pruneLogMarks(logMarks, lineCount) : emptyLogMarks,
    [language, logMarks, lineCount],
  );

  // Pruning must update storage, not only the decorations. Otherwise marks
  // past EOF reappear if a rotated log later grows back to its old length.
  useEffect(() => {
    if (language === "log" && !logMarksEqual(logMarks, visibleMarks)) {
      persistMarks(visibleMarks);
    }
  }, [language, logMarks, persistMarks, visibleMarks]);

  const markCurrentLine = () => {
    // Ask the view rather than recomputing from the string: it already knows
    // the line, including how the document's line breaks were counted.
    const line = apiRef.current?.getCursorLine();
    if (!line) {
      return;
    }
    persistMarks(toggleLogMark(visibleMarks, line, markColor));
  };

  const logFilterStats = useMemo(() => {
    if (language !== "log" || !isLogFilterActive(logFilter)) {
      return null;
    }
    return computeLogFilterRanges(splitLogFilterLines(query), logFilter);
  }, [language, query, logFilter]);

  const className = `editor-shell editor-group${active ? " active" : ""}${
    editorBackgroundStyle ? " editor-shell-has-background" : ""
  }${language === "log" ? " editor-shell-with-log-filter" : ""}`;

  return (
    <div
      className={className}
      style={editorBackgroundStyle}
      onFocusCapture={() => setActiveEditorGroup(group)}
      onPointerDown={() => setActiveEditorGroup(group)}
      onContextMenu={(event) => onContextMenu(event, group)}
    >
      {editorBackgroundStyle ? (
        <div className="editor-background-image" aria-hidden="true" />
      ) : null}
      {renderEditorTabStrip(group)}
      {language === "log" ? (
        <>
          <LogFilterBar
            filter={logFilter}
            hiddenLineCount={logFilterStats?.hiddenLineCount ?? 0}
            onFilterChange={setLogFilter}
          />
          <LogMarksBar
            marks={visibleMarks}
            activeColor={markColor}
            onActiveColorChange={setMarkColor}
            onMarkCurrentLine={markCurrentLine}
            onJumpToLine={(line) => apiRef.current?.revealLine(line)}
            onClearMarks={() => persistMarks(emptyLogMarks)}
          />
          <LogProfileBar
            profileId={logProfile}
            hasContent={query.trim().length > 0}
            onProfileChange={setLogProfile}
            onCreateTable={() =>
              onLogProfileImport?.({
                fileName: tabLabel,
                text: query,
                profileId: logProfile,
              })
            }
          />
        </>
      ) : null}
      <div className="editor-buffer">
        <SqlEditor
          ref={apiRef}
          value={query}
          tabLabel={tabLabel}
          logFilter={language === "log" ? logFilter : undefined}
          logMarks={language === "log" ? visibleMarks : undefined}
          onChange={onQueryChange}
          onSelectionChange={(selection) => {
            setActiveEditorGroup(group);
            setEditorSelection(group, selection);
          }}
          engine={editorEngine}
          metadata={activeMetadata}
          snippets={sqlSnippets}
          theme={theme}
          vimMode={vimMode}
          formatter={formatter}
          linter={sqlLinter}
          onMetadataJump={onMetadataJump}
          onMetadataToolWindow={onMetadataToolWindow}
        />
      </div>
    </div>
  );
}

export function editorShellBackgroundStyle(
  image: string,
  opacity: number,
): CSSProperties | undefined {
  const trimmed = image.trim();
  if (!trimmed) {
    return undefined;
  }
  return {
    "--editor-background-image": `url("${escapeCssUrl(trimmed)}")`,
    "--editor-background-image-opacity": String(opacity),
  } as CSSProperties;
}

function escapeCssUrl(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .replace(/\f/g, "");
}
