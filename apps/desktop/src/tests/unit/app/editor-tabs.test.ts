import { describe, expect, it } from "vitest";
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
} from "@/app/editor-tabs";

describe("editor tab state", () => {
  it("keeps split editor groups independent", () => {
    let primary = createEditorGroupState("select 1;");
    let secondary = createEditorGroupState("select 2;");

    primary = renameSqlTabInEditorGroup(primary, "scratch", "left.sql");
    primary = closeSqlTabInEditorGroup(primary, "audit").state;

    expect(activeTabLabelForEditorGroup(primary)).toBe("left.sql");
    expect(openTabsForEditorGroup(primary).map((tab) => tab.id)).toEqual([
      "scratch",
      "explain",
    ]);
    expect(activeTabLabelForEditorGroup(secondary)).toBe("scratch.sql");
    expect(openTabsForEditorGroup(secondary).map((tab) => tab.id)).toEqual([
      "scratch",
      "audit",
      "explain",
    ]);
    expect(queryForEditorGroup(secondary)).toBe("select 2;");
  });

  it("opens new tabs and duplicates only the selected tab contents", () => {
    let state = createEditorGroupState("select current;");
    state = addSqlTabToEditorGroup(state, {
      id: "adhoc",
      label: "adhoc.sql",
      query: "select adhoc;",
    });
    state = selectEditorTabInGroup(state, "scratch");
    state = duplicateSqlTabInEditorGroup(state, "scratch", {
      id: "scratch-copy",
    });

    expect(state.activeTabId).toBe("scratch-copy");
    expect(state.queryByTabId["scratch-copy"]).toBe("select current;");
    expect(state.queryByTabId.adhoc).toBe("select adhoc;");
    expect(state.tabs.map((tab) => tab.label)).toContain("scratch-copy.sql");
  });

  it("keeps the source extension when duplicating non-SQL tabs", () => {
    let state = createEditorGroupState("");
    state = addSqlTabToEditorGroup(state, {
      id: "orders",
      label: "orders.csv",
      query: "id,name",
    });
    state = duplicateSqlTabInEditorGroup(state, "orders", {
      id: "orders-copy",
    });
    expect(state.tabs.map((tab) => tab.label)).toContain("orders-copy.csv");

    state = duplicateSqlTabInEditorGroup(state, "orders", {
      id: "orders-copy-2",
    });
    expect(state.tabs.map((tab) => tab.label)).toContain("orders-copy-2.csv");
  });

  it("closes the last tab and reopens closed tabs inside the same group", () => {
    let state = createEditorGroupState("");
    state = closeOtherSqlTabsInEditorGroup(state, "explain");

    const emptied = closeSqlTabInEditorGroup(state, "explain");
    expect(emptied.closedTab?.id).toBe("explain");
    expect(emptied.state.openTabIds).toEqual([]);
    expect(emptied.state.activeTabId).toBe(noOpenTabId);

    const restored = reopenSqlTabInEditorGroup(emptied.state);
    expect(restored.restoredTab?.id).toBe("scratch");
    expect(restored.state.activeTabId).toBe("scratch");
    expect(restored.state.openTabIds).toEqual(["scratch"]);
  });

  it("revives a group that was persisted with every tab closed", () => {
    let state = createEditorGroupState("select 1;");
    state = closeOtherSqlTabsInEditorGroup(state, "scratch");
    const emptied = closeSqlTabInEditorGroup(state, "scratch").state;

    const revived = reviveEditorGroupState(JSON.parse(JSON.stringify(emptied)));
    expect(revived?.openTabIds).toEqual([]);
    expect(revived?.activeTabId).toBe(noOpenTabId);
    // The buffer text survives so reopening the tab restores unsaved SQL.
    expect(revived?.queryByTabId.scratch).toBe("select 1;");
  });

  it("revives a persisted editor group state round-trip", () => {
    let state = createEditorGroupState("select 1;");
    state = addSqlTabToEditorGroup(state, {
      id: "adhoc",
      label: "adhoc.sql",
      query: "select adhoc;",
    });

    const revived = reviveEditorGroupState(JSON.parse(JSON.stringify(state)));
    expect(revived).toEqual(state);
  });

  it("re-anchors revived state when stored ids are stale or malformed", () => {
    const revived = reviveEditorGroupState({
      tabs: [
        { id: "scratch", label: "scratch.sql" },
        { id: 42, label: "bad.sql" },
      ],
      activeTabId: "gone",
      openTabIds: ["gone", "scratch"],
      queryByTabId: { scratch: "select 1;", gone: "select 2;" },
      selectionsByTabId: { scratch: "not-a-selection" },
    });

    expect(revived).not.toBeNull();
    expect(revived?.tabs).toEqual([{ id: "scratch", label: "scratch.sql" }]);
    expect(revived?.openTabIds).toEqual(["scratch"]);
    expect(revived?.activeTabId).toBe("scratch");
    expect(revived?.queryByTabId).toEqual({ scratch: "select 1;" });
    expect(revived?.selectionsByTabId.scratch).toEqual([{ from: 0, to: 0 }]);
  });

  it("rejects unusable persisted values", () => {
    expect(reviveEditorGroupState(null)).toBeNull();
    expect(reviveEditorGroupState("state")).toBeNull();
    expect(reviveEditorGroupState({ tabs: [] })).toBeNull();
    expect(
      reviveEditorGroupState({
        tabs: [],
        activeTabId: "scratch",
        openTabIds: [],
        queryByTabId: {},
      }),
    ).toBeNull();
  });

  /**
   * The label counter used to be `tabs.length + 1`. `tabs` keeps closed tabs
   * so Reopen closed tab can restore them, and it holds the three onboarding
   * buffers as well — so the first new tab in an untouched group was called
   * `query-4.sql`, and each tab closed first pushed the number further out.
   */
  it("numbers a new tab from the query labels present, not the tab count", () => {
    let state = createEditorGroupState("select 1;");
    expect(state.tabs).toHaveLength(3);

    state = addSqlTabToEditorGroup(state);
    expect(state.tabs.at(-1)?.label).toBe("query-1.sql");

    state = addSqlTabToEditorGroup(state);
    expect(state.tabs.at(-1)?.label).toBe("query-2.sql");
  });

  it("does not let closed tabs inflate the next number", () => {
    let state = createBlankEditorGroupState();
    state = addSqlTabToEditorGroup(state);
    const [, second] = state.tabs;
    // Closing keeps the tab for Reopen closed tab, so it is still in `tabs`.
    state = closeSqlTabInEditorGroup(state, second.id).state;
    expect(state.tabs).toHaveLength(2);

    // query-2 is still taken by the closed tab; the next free number is 3.
    state = addSqlTabToEditorGroup(state);
    expect(state.tabs.at(-1)?.label).toBe("query-3.sql");
  });

  it("opens a first-time connection on a single query-1.sql", () => {
    const state = createBlankEditorGroupState();

    expect(state.tabs.map((tab) => tab.label)).toEqual(["query-1.sql"]);
    expect(openTabsForEditorGroup(state)).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });
});
