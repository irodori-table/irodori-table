import { describe, expect, it } from "vitest";
import {
  closeSqlTabInEditorGroup,
  createEditorGroupState,
  openTabsForEditorGroup,
  queryForEditorGroup,
  showTableTabInEditorGroup,
  tableTabId,
} from "@/app/editor-tabs";

/**
 * A click on a table in the sidebar opens that table in its own tab instead
 * of writing its preview over the SQL in the current tab. Clicking it again
 * goes back to the same tab, however many times it is clicked.
 */

const usersTab = {
  id: tableTabId("public", "users"),
  label: "users",
  query: 'select * from "public"."users" limit 200;',
};

describe("table tabs", () => {
  it("opens a table in a new tab and leaves the current one alone", () => {
    const before = createEditorGroupState("select 1;");

    const state = showTableTabInEditorGroup(before, usersTab);

    expect(state.activeTabId).toBe(usersTab.id);
    expect(queryForEditorGroup(state)).toBe(usersTab.query);
    expect(state.queryByTabId.scratch).toBe("select 1;");
    expect(openTabsForEditorGroup(state).map((tab) => tab.label)).toEqual([
      "scratch.sql",
      "audit-window.sql",
      "explain-plan.sql",
      "users",
    ]);
  });

  it("goes back to the table's tab on every later click", () => {
    let state = createEditorGroupState("select 1;");
    for (let click = 0; click < 5; click += 1) {
      state = showTableTabInEditorGroup(state, usersTab);
    }

    expect(
      openTabsForEditorGroup(state).filter((tab) => tab.id === usersTab.id),
    ).toHaveLength(1);
    expect(state.activeTabId).toBe(usersTab.id);
  });

  it("keeps SQL typed into an open table tab", () => {
    let state = showTableTabInEditorGroup(
      createEditorGroupState("select 1;"),
      usersTab,
    );
    state = {
      ...state,
      queryByTabId: {
        ...state.queryByTabId,
        [usersTab.id]: "select id from users where id = 1;",
      },
      activeTabId: "scratch",
    };

    state = showTableTabInEditorGroup(state, usersTab);

    expect(state.activeTabId).toBe(usersTab.id);
    expect(queryForEditorGroup(state)).toBe(
      "select id from users where id = 1;",
    );
  });

  it("reopens a closed table tab with a fresh preview", () => {
    let state = showTableTabInEditorGroup(
      createEditorGroupState("select 1;"),
      usersTab,
    );
    state = {
      ...state,
      queryByTabId: { ...state.queryByTabId, [usersTab.id]: "stale" },
    };
    state = closeSqlTabInEditorGroup(state, usersTab.id).state;

    state = showTableTabInEditorGroup(state, usersTab);

    expect(state.tabs.filter((tab) => tab.id === usersTab.id)).toHaveLength(1);
    expect(state.activeTabId).toBe(usersTab.id);
    expect(queryForEditorGroup(state)).toBe(usersTab.query);
  });

  it("gives tables of the same name in different schemas their own tabs", () => {
    expect(tableTabId("public", "users")).not.toBe(tableTabId("auth", "users"));
  });
});
