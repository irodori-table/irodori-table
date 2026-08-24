import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ActionNotice } from "@/app/ActionToast";
import {
  activeTabLabelForEditorGroup,
  addSqlTabToEditorGroup,
  closeOtherSqlTabsInEditorGroup,
  closeSqlTabInEditorGroup,
  createBlankEditorGroupState,
  createEditorGroupState,
  duplicateSqlTabInEditorGroup,
  noOpenTabId,
  openTabsForEditorGroup,
  queryForEditorGroup,
  renameSqlTabInEditorGroup,
  reopenSqlTabInEditorGroup,
  reviveEditorGroupState,
  selectEditorTabInGroup,
  selectionsForEditorGroup,
  type EditorGroupState,
} from "@/app/editor-tabs";
import type {
  EditorGroup,
  EditorSelections,
  SqlEditorHandle,
} from "@/features/query-editor";
import { useConnectionStore } from "@/features/connections";
import type { SearchTab } from "@/features/search/SearchReplacePanel";
import type { EditorSplitMode } from "@/features/workbench";
import type { Translator } from "@/i18n";
import type { TextMatch } from "@/sql/text-search";

type EditorGroupStates = Record<EditorGroup, EditorGroupState>;

/**
 * Tab state, keyed by connection id.
 *
 * Tabs used to be global: one `{ primary, secondary }` pair shared by every
 * profile. Switching connection therefore left the same SQL on screen aimed at
 * a different database — the editor said nothing had changed while everything
 * underneath it had. Keying the whole pair by connection makes a switch swap
 * the workbench the way TablePlus does: each connection keeps its own tabs,
 * its own active tab, and its own unsaved text.
 */
type EditorWorkspaces = Record<string, EditorGroupStates>;

/** Workspace key while no connection is active (`activeConnectionId` is ""). */
const unconnectedWorkspaceId = "";

// Tab text lives only in React state, so persist every group (tabs, active
// tab, per-tab text and selections) to localStorage: quit, reload, or crash
// must not silently lose unsaved SQL.
const editorTabsStorageKey = "irodori.editorTabs.v2";
/**
 * The pre-connection layout: a bare `{ primary, secondary }` pair with no
 * connection dimension. Read once and adopted by the first workspace that
 * needs one, so upgrading does not throw away the SQL that was open when the
 * app last closed.
 */
const legacyEditorTabsStorageKey = "irodori.editorTabs.v1";
const persistDebounceMs = 400;

/** Dispatch to force a synchronous persist (used before closing the window). */
export const flushEditorTabsEvent = "irodori:flush-editor-tabs";

function reviveEditorGroupStates(value: unknown): EditorGroupStates | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<EditorGroupStates>;
  const primary = reviveEditorGroupState(candidate.primary);
  if (!primary) {
    return null;
  }
  return {
    primary,
    secondary:
      reviveEditorGroupState(candidate.secondary) ??
      createBlankEditorGroupState(),
  };
}

/**
 * A workspace holding nothing: no open tab in either group and no text left
 * behind in a closed one. Connections come and go, and without this the stored
 * map would keep a pair of empty groups for every profile ever selected.
 */
function isBlankWorkspace(states: EditorGroupStates): boolean {
  return Object.values(states).every(
    (state) =>
      state.openTabIds.length === 0 &&
      Object.values(state.queryByTabId).every((text) => text.trim() === ""),
  );
}

function loadPersistedWorkspaces(): EditorWorkspaces {
  try {
    const raw = window.localStorage.getItem(editorTabsStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const workspaces: EditorWorkspaces = {};
    for (const [connectionId, value] of Object.entries(parsed)) {
      const states = reviveEditorGroupStates(value);
      if (states && !isBlankWorkspace(states)) {
        workspaces[connectionId] = states;
      }
    }
    return workspaces;
  } catch {
    return {};
  }
}

function loadLegacyEditorGroupStates(): EditorGroupStates | null {
  try {
    const raw = window.localStorage.getItem(legacyEditorTabsStorageKey);
    return raw ? reviveEditorGroupStates(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function persistWorkspaces(workspaces: EditorWorkspaces) {
  try {
    window.localStorage.setItem(
      editorTabsStorageKey,
      JSON.stringify(workspaces),
    );
  } catch {
    // Quota/privacy failures just mean no restore on next launch.
  }
}

export type EditorTabMenuState = {
  x: number;
  y: number;
  group: EditorGroup;
  tabId: string;
} | null;

export type UseEditorGroupsDeps = {
  loadInitialQuery: () => string;
  editorSplitMode: EditorSplitMode;
  editorApiRef: RefObject<SqlEditorHandle | null>;
  secondaryEditorApiRef: RefObject<SqlEditorHandle | null>;
  showActionNotice: (
    kind: ActionNotice["kind"],
    title: string,
    detail?: string,
  ) => void;
  t: Translator["t"];
};

export function useEditorGroups({
  loadInitialQuery,
  editorSplitMode,
  editorApiRef,
  secondaryEditorApiRef,
  showActionNotice,
  t,
}: UseEditorGroupsDeps) {
  // Read straight from the store rather than threaded down: `useEditorGroups`
  // sits inside the editor seam, which has no connection props, and the only
  // fact it needs is which workspace to show.
  const activeConnectionId = useConnectionStore(
    (state) => state.activeConnectionId,
  );
  const workspaceId = activeConnectionId || unconnectedWorkspaceId;
  const [workspaces, setWorkspaces] = useState<EditorWorkspaces>(
    loadPersistedWorkspaces,
  );
  // The v1 blob (or a first-run scratch tab) waiting to be adopted. Whichever
  // workspace is asked for first takes it, and no later one can — otherwise
  // every connection would open holding a copy of the same restored SQL.
  const pendingSeedRef = useRef<EditorGroupStates | null | undefined>(
    undefined,
  );
  if (pendingSeedRef.current === undefined) {
    pendingSeedRef.current = loadLegacyEditorGroupStates() ?? {
      primary: createEditorGroupState(loadInitialQuery()),
      secondary: createEditorGroupState(""),
    };
  }
  // Identity matters: an unmaterialised workspace is handed out on every
  // render until its first edit, and a fresh object each time would remount
  // the editors and drop the caret.
  const blankWorkspacesRef = useRef(new Map<string, EditorGroupStates>());

  function workspaceStates(
    all: EditorWorkspaces,
    id: string,
  ): EditorGroupStates {
    const stored = all[id];
    if (stored) {
      return stored;
    }
    const cached = blankWorkspacesRef.current.get(id);
    if (cached) {
      return cached;
    }
    const seed = pendingSeedRef.current;
    pendingSeedRef.current = null;
    // Blank, not the onboarding set: those three sample tabs belong to first
    // run, and repeating them for every connection would also start each one's
    // numbering at `query-4.sql`.
    const created = seed ?? {
      primary: createBlankEditorGroupState(),
      secondary: createBlankEditorGroupState(),
    };
    blankWorkspacesRef.current.set(id, created);
    return created;
  }

  const editorGroupStates = workspaceStates(workspaces, workspaceId);
  const [preferredEditorGroup, setActiveEditorGroup] =
    useState<EditorGroup>("primary");
  const activeEditorGroup: EditorGroup =
    editorSplitMode === "single" ? "primary" : preferredEditorGroup;
  const activeEditorGroupState = editorGroupStates[activeEditorGroup];
  const query = queryForEditorGroup(activeEditorGroupState);
  const editorSelections = selectionsForEditorGroup(activeEditorGroupState);
  const activeTabLabel = activeTabLabelForEditorGroup(activeEditorGroupState);
  // `tab.close` escalates when there is nothing left to close: the caller
  // turns the second Ctrl+W on an empty group into "close this connection".
  const hasOpenTabs = openTabsForEditorGroup(activeEditorGroupState).length > 0;
  const [editorTabMenu, setEditorTabMenu] = useState<EditorTabMenuState>(null);

  // Debounced persistence while typing, plus a synchronous flush on pagehide
  // so a quit right after the last keystroke still lands in localStorage.
  useEffect(() => {
    const handle = window.setTimeout(
      () => persistWorkspaces(workspaces),
      persistDebounceMs,
    );
    const flush = () => persistWorkspaces(workspaces);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    window.addEventListener(flushEditorTabsEvent, flush);
    return () => {
      window.clearTimeout(handle);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener(flushEditorTabsEvent, flush);
    };
  }, [workspaces]);

  useEffect(() => {
    if (!editorTabMenu) {
      return;
    }
    const close = () => setEditorTabMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setEditorTabMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [editorTabMenu]);

  function updateEditorGroupState(
    group: EditorGroup,
    updater: (state: EditorGroupState) => EditorGroupState,
  ) {
    setWorkspaces((current) => {
      const states = workspaceStates(current, workspaceId);
      return {
        ...current,
        [workspaceId]: { ...states, [group]: updater(states[group]) },
      };
    });
  }

  function setEditorGroupQuery(group: EditorGroup, nextQuery: string) {
    updateEditorGroupState(group, (state) => {
      // Every "load this SQL into the editor" path goes through here — history
      // restore, query magics, ERD export. Now that the last tab can be
      // closed, the group may have nothing to write into; opening a tab is the
      // only outcome that puts the SQL somewhere the user can see it, rather
      // than parking it under an id that renders nowhere.
      if (state.activeTabId === noOpenTabId) {
        return addSqlTabToEditorGroup(state, { query: nextQuery });
      }
      return {
        ...state,
        queryByTabId: {
          ...state.queryByTabId,
          [state.activeTabId]: nextQuery,
        },
      };
    });
  }

  function setQuery(nextQuery: string) {
    setEditorGroupQuery(activeEditorGroup, nextQuery);
  }

  function setEditorGroupSelection(
    group: EditorGroup,
    selection: EditorSelections,
  ) {
    updateEditorGroupState(group, (state) => ({
      ...state,
      selectionsByTabId: {
        ...state.selectionsByTabId,
        [state.activeTabId]: selection,
      },
    }));
  }

  function selectEditorTab(group: EditorGroup, tabId: string) {
    setActiveEditorGroup(group);
    updateEditorGroupState(group, (state) =>
      selectEditorTabInGroup(state, tabId),
    );
  }

  const searchTabs = useMemo<SearchTab[]>(() => {
    const groups: EditorGroup[] =
      editorSplitMode === "single" ? ["primary"] : ["primary", "secondary"];
    return groups.flatMap((group) => {
      const state = editorGroupStates[group];
      return openTabsForEditorGroup(state).map((tab) => ({
        key: `${group}:${tab.id}`,
        group,
        tabId: tab.id,
        label:
          editorSplitMode === "single" ? tab.label : `${tab.label} · ${group}`,
        text: state.queryByTabId[tab.id] ?? "",
      }));
    });
  }, [editorGroupStates, editorSplitMode]);

  function replaceSearchTab(tab: SearchTab, nextText: string) {
    updateEditorGroupState(tab.group as EditorGroup, (state) => ({
      ...state,
      queryByTabId: { ...state.queryByTabId, [tab.tabId]: nextText },
    }));
  }

  function revealSearchMatch(tab: SearchTab, match: TextMatch) {
    const group = tab.group as EditorGroup;
    selectEditorTab(group, tab.tabId);
    window.setTimeout(() => {
      const api =
        group === "secondary"
          ? secondaryEditorApiRef.current
          : editorApiRef.current;
      api?.revealRange({ from: match.start, to: match.end });
      api?.focus();
    }, 0);
  }

  function newSqlTab(group: EditorGroup = activeEditorGroup) {
    updateEditorGroupState(group, addSqlTabToEditorGroup);
    setActiveEditorGroup(group);
  }

  /** Open generated SQL without replacing the source tab that produced it. */
  function openSqlInNewTab(
    sql: string,
    group: EditorGroup = activeEditorGroup,
  ) {
    updateEditorGroupState(group, (state) =>
      addSqlTabToEditorGroup(state, { query: sql }),
    );
    setActiveEditorGroup(group);
  }

  function renameSqlTab(group: EditorGroup, tabId: string) {
    const state = editorGroupStates[group];
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const next = window
      .prompt(t("editorTabs.renameSqlTabPrompt"), tab.label)
      ?.trim();
    if (!next || next === tab.label) {
      return;
    }
    updateEditorGroupState(group, (current) =>
      renameSqlTabInEditorGroup(current, tabId, next),
    );
    setActiveEditorGroup(group);
    showActionNotice("success", t("notice.editor.tabRenamed"), next);
  }

  function duplicateSqlTab(group: EditorGroup, tabId: string) {
    const state = editorGroupStates[group];
    const source = state.tabs.find((item) => item.id === tabId);
    if (!source) return;
    updateEditorGroupState(group, (current) =>
      duplicateSqlTabInEditorGroup(current, tabId),
    );
    setActiveEditorGroup(group);
    showActionNotice("success", t("notice.editor.tabDuplicated"), source.label);
  }

  function closeActiveSqlTab(group: EditorGroup = activeEditorGroup) {
    const state = editorGroupStates[group];
    closeSqlTab(group, state.activeTabId);
  }

  function closeSqlTab(group: EditorGroup, tabId: string) {
    const state = editorGroupStates[group];
    const result = closeSqlTabInEditorGroup(state, tabId);
    if (!result.closedTab) {
      return;
    }
    updateEditorGroupState(group, () => result.state);
    showActionNotice(
      "info",
      t("notice.editor.tabClosed"),
      result.closedTab.label,
    );
  }

  function closeOtherSqlTabs(group: EditorGroup, tabId: string) {
    const state = editorGroupStates[group];
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    updateEditorGroupState(group, (current) =>
      closeOtherSqlTabsInEditorGroup(current, tabId),
    );
    setActiveEditorGroup(group);
    showActionNotice("info", t("notice.editor.otherTabsClosed"), tab.label);
  }

  function reopenSqlTab(group: EditorGroup = activeEditorGroup) {
    const state = editorGroupStates[group];
    const result = reopenSqlTabInEditorGroup(state);
    if (!result.restoredTab) {
      showActionNotice("info", t("notice.editor.tabsAlreadyOpen"));
      return;
    }
    setActiveEditorGroup(group);
    updateEditorGroupState(group, () => result.state);
    showActionNotice(
      "success",
      t("notice.editor.tabRestored"),
      result.restoredTab.label,
    );
  }

  return {
    activeEditorGroup,
    activeTabLabel,
    closeActiveSqlTab,
    closeOtherSqlTabs,
    closeSqlTab,
    duplicateSqlTab,
    editorGroupStates,
    editorSelections,
    editorTabMenu,
    hasOpenTabs,
    newSqlTab,
    openSqlInNewTab,
    primaryQuery: queryForEditorGroup(editorGroupStates.primary),
    query,
    renameSqlTab,
    reopenSqlTab,
    replaceSearchTab,
    revealSearchMatch,
    searchTabs,
    secondaryQuery: queryForEditorGroup(editorGroupStates.secondary),
    selectEditorTab,
    setActiveEditorGroup,
    setEditorGroupQuery,
    setEditorGroupSelection,
    setEditorTabMenu,
    setQuery,
  };
}
