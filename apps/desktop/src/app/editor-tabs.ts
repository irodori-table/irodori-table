import { tabs as defaultEditorTabs } from "@/app/app-config";
import type { EditorSelections } from "@/features/query-editor";

export type EditorTabDefinition = {
  id: string;
  label: string;
};

export type EditorGroupState = {
  tabs: EditorTabDefinition[];
  activeTabId: string;
  openTabIds: string[];
  queryByTabId: Record<string, string>;
  selectionsByTabId: Record<string, EditorSelections>;
};

export type EditorTabCloseResult = {
  state: EditorGroupState;
  closedTab: EditorTabDefinition | null;
};

export type EditorTabRestoreResult = {
  state: EditorGroupState;
  restoredTab: EditorTabDefinition | null;
};

export const defaultEditorSelections: EditorSelections = [{ from: 0, to: 0 }];

/** `activeTabId` when the group has no open tab left (every tab was closed). */
export const noOpenTabId = "";

/**
 * A group for a connection opened for the first time: one empty `query-1.sql`.
 *
 * `createEditorGroupState` seeds the three onboarding tabs (scratch, audit
 * window, explain plan), which is right once, on first run. Now that every
 * connection gets its own group, using it there would greet each new connection
 * with the same three sample buffers — and push its first real tab to
 * `query-4.sql`.
 */
export function createBlankEditorGroupState(): EditorGroupState {
  return addSqlTabToEditorGroup({
    tabs: [],
    activeTabId: noOpenTabId,
    openTabIds: [],
    queryByTabId: {},
    selectionsByTabId: {},
  });
}

export function createEditorGroupState(initialQuery: string): EditorGroupState {
  const initialTabs = defaultEditorTabs.map((tab) => ({ ...tab }));
  return {
    tabs: initialTabs,
    activeTabId: initialTabs[0]?.id ?? "scratch",
    openTabIds: initialTabs.map((tab) => tab.id),
    queryByTabId: Object.fromEntries(
      initialTabs.map((tab, index) => [
        tab.id,
        index === 0 ? initialQuery : "",
      ]),
    ) as Record<string, string>,
    selectionsByTabId: Object.fromEntries(
      initialTabs.map((tab) => [tab.id, defaultEditorSelections]),
    ) as Record<string, EditorSelections>,
  };
}

/**
 * Validate an untrusted (localStorage) value back into an EditorGroupState.
 * Drops malformed tabs, re-anchors openTabIds/activeTabId to surviving tabs,
 * and defaults missing per-tab text/selections. Returns null when there is
 * nothing usable to restore.
 */
export function reviveEditorGroupState(
  value: unknown,
): EditorGroupState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<EditorGroupState>;
  if (
    !Array.isArray(candidate.tabs) ||
    !Array.isArray(candidate.openTabIds) ||
    typeof candidate.activeTabId !== "string" ||
    typeof candidate.queryByTabId !== "object" ||
    candidate.queryByTabId === null
  ) {
    return null;
  }
  const tabs = candidate.tabs.filter(
    (tab): tab is EditorTabDefinition =>
      typeof tab === "object" &&
      tab !== null &&
      typeof (tab as EditorTabDefinition).id === "string" &&
      typeof (tab as EditorTabDefinition).label === "string",
  );
  if (tabs.length === 0) {
    return null;
  }
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const openFromStore = candidate.openTabIds.filter(
    (id): id is string => typeof id === "string" && tabIds.has(id),
  );
  // An empty open set is a legitimate state: closing the last tab leaves the
  // group with no buffer, and a reload must not silently reopen one.
  const openTabIds = openFromStore;
  const activeTabId = openTabIds.includes(candidate.activeTabId)
    ? candidate.activeTabId
    : (openTabIds[0] ?? noOpenTabId);
  const storedQueries = candidate.queryByTabId as Record<string, unknown>;
  const storedSelections = (candidate.selectionsByTabId ?? {}) as Record<
    string,
    unknown
  >;
  const queryByTabId: Record<string, string> = {};
  const selectionsByTabId: Record<string, EditorSelections> = {};
  for (const tab of tabs) {
    const query = storedQueries[tab.id];
    queryByTabId[tab.id] = typeof query === "string" ? query : "";
    const selections = storedSelections[tab.id];
    selectionsByTabId[tab.id] = isEditorSelections(selections)
      ? selections
      : defaultEditorSelections;
  }
  return { tabs, activeTabId, openTabIds, queryByTabId, selectionsByTabId };
}

function isEditorSelections(value: unknown): value is EditorSelections {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (selection) =>
        typeof selection === "object" &&
        selection !== null &&
        typeof (selection as { from?: unknown }).from === "number" &&
        typeof (selection as { to?: unknown }).to === "number",
    )
  );
}

export function queryForEditorGroup(state: EditorGroupState) {
  return state.queryByTabId[state.activeTabId] ?? "";
}

export function selectionsForEditorGroup(state: EditorGroupState) {
  return state.selectionsByTabId[state.activeTabId] ?? defaultEditorSelections;
}

export function openTabsForEditorGroup(state: EditorGroupState) {
  return state.tabs.filter((tab) => state.openTabIds.includes(tab.id));
}

export function hasOpenTabsInEditorGroup(state: EditorGroupState) {
  return openTabsForEditorGroup(state).length > 0;
}

export function activeTabLabelForEditorGroup(state: EditorGroupState) {
  return (
    openTabsForEditorGroup(state).find((tab) => tab.id === state.activeTabId)
      ?.label ??
    state.tabs[0]?.label ??
    "scratch.sql"
  );
}

export function selectEditorTabInGroup(
  state: EditorGroupState,
  tabId: string,
): EditorGroupState {
  if (!state.openTabIds.includes(tabId)) {
    return state;
  }
  return {
    ...state,
    activeTabId: tabId,
  };
}

export function addSqlTabToEditorGroup(
  state: EditorGroupState,
  options: { id?: string; label?: string; query?: string } = {},
): EditorGroupState {
  const id = options.id ?? createSqlTabId();
  const tab = { id, label: options.label ?? nextSqlTabLabel(state) };
  return {
    ...state,
    tabs: [...state.tabs, tab],
    openTabIds: [...state.openTabIds, id],
    activeTabId: id,
    queryByTabId: { ...state.queryByTabId, [id]: options.query ?? "" },
    selectionsByTabId: {
      ...state.selectionsByTabId,
      [id]: defaultEditorSelections,
    },
  };
}

export function renameSqlTabInEditorGroup(
  state: EditorGroupState,
  tabId: string,
  label: string,
): EditorGroupState {
  const nextLabel = label.trim();
  if (!nextLabel) {
    return state;
  }
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, label: nextLabel } : tab,
    ),
  };
}

export function duplicateSqlTabInEditorGroup(
  state: EditorGroupState,
  tabId: string,
  options: { id?: string } = {},
): EditorGroupState {
  const source = state.tabs.find((tab) => tab.id === tabId);
  if (!source) {
    return state;
  }
  const sourceText = state.queryByTabId[tabId] ?? "";
  return addSqlTabToEditorGroup(state, {
    id: options.id,
    label: nextDuplicateLabel(state, source.label),
    query: sourceText,
  });
}

export function closeSqlTabInEditorGroup(
  state: EditorGroupState,
  tabId: string,
): EditorTabCloseResult {
  const groupOpenTabs = openTabsForEditorGroup(state);
  const activeIndex = groupOpenTabs.findIndex((tab) => tab.id === tabId);
  if (activeIndex < 0) {
    return { state, closedTab: null };
  }

  const closedTab = groupOpenTabs[activeIndex];
  // Closing the last tab is allowed and leaves the group empty; the shell
  // renders a placeholder and the tab stays reopenable from the tab menu.
  const nextTab =
    groupOpenTabs[activeIndex + 1] ?? groupOpenTabs[activeIndex - 1];
  return {
    state: {
      ...state,
      openTabIds: state.openTabIds.filter((id) => id !== closedTab.id),
      activeTabId:
        state.activeTabId === closedTab.id
          ? (nextTab?.id ?? noOpenTabId)
          : state.activeTabId,
    },
    closedTab,
  };
}

export function closeOtherSqlTabsInEditorGroup(
  state: EditorGroupState,
  tabId: string,
): EditorGroupState {
  if (!state.openTabIds.includes(tabId)) {
    return state;
  }
  return {
    ...state,
    openTabIds: [tabId],
    activeTabId: tabId,
  };
}

export function reopenSqlTabInEditorGroup(
  state: EditorGroupState,
): EditorTabRestoreResult {
  const restoredTab = state.tabs.find(
    (tab) => !state.openTabIds.includes(tab.id),
  );
  if (!restoredTab) {
    return { state, restoredTab: null };
  }
  return {
    state: {
      ...state,
      openTabIds: [...state.openTabIds, restoredTab.id],
      activeTabId: restoredTab.id,
    },
    restoredTab,
  };
}

function createSqlTabId() {
  return `query-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function nextSqlTabLabel(state: EditorGroupState) {
  // Number from the `query-N` labels the group actually holds, not from how
  // many tabs it has. `tabs` keeps closed tabs so Reopen closed tab can restore
  // them, and the onboarding tabs sit in there too — so counting entries made
  // the first new tab in an untouched group `query-4.sql`, and every tab closed
  // beforehand pushed it further out.
  const used = new Set<number>();
  for (const tab of state.tabs) {
    const match = /^query-(\d+)\.sql$/.exec(tab.label);
    if (match) {
      used.add(Number(match[1]));
    }
  }
  let index = 1;
  while (used.has(index)) {
    index += 1;
  }
  return `query-${index}.sql`;
}

function nextDuplicateLabel(state: EditorGroupState, label: string) {
  // Keep the source tab's extension: labels route the buffer language
  // (EDITOR-178), so duplicating `data.csv` must stay a `.csv` tab.
  const match = /^(.*?)(\.[a-z0-9]+)?$/i.exec(label.trim());
  const base = match?.[1] || "query";
  const extension = match?.[2] ?? ".sql";
  const labels = new Set(state.tabs.map((tab) => tab.label));
  let index = 1;
  let next = `${base}-copy${extension}`;
  while (labels.has(next)) {
    index += 1;
    next = `${base}-copy-${index}${extension}`;
  }
  return next;
}
