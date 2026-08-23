// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorGroups } from "@/app/controllers/use-editor-groups";
import { queryForEditorGroup } from "@/app/editor-tabs";
import { useConnectionStore } from "@/features/connections";

/**
 * Tabs belong to a connection.
 *
 * They used to be global: one group pair shared by every profile, so switching
 * connection left the same SQL on screen aimed at a different database. The
 * editor said nothing had changed while everything under it had — the failure
 * mode is a statement written for staging running against prod.
 */
function editorGroups() {
  return renderHook(() =>
    useEditorGroups({
      loadInitialQuery: () => "select 1;",
      editorSplitMode: "single",
      editorApiRef: { current: null },
      secondaryEditorApiRef: { current: null },
      showActionNotice: vi.fn(),
      t: ((key: string) => key) as never,
    }),
  );
}

function activate(connectionId: string) {
  act(() => {
    useConnectionStore.setState({ activeConnectionId: connectionId });
  });
}

describe("useEditorGroups keyed by connection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useConnectionStore.setState({ activeConnectionId: "prod" });
  });

  it("gives each connection its own tab text", () => {
    const { result } = editorGroups();

    act(() => result.current.setEditorGroupQuery("primary", "select prod;"));
    expect(queryForEditorGroup(result.current.editorGroupStates.primary)).toBe(
      "select prod;",
    );

    activate("staging");
    expect(
      queryForEditorGroup(result.current.editorGroupStates.primary),
    ).not.toBe("select prod;");

    act(() => result.current.setEditorGroupQuery("primary", "select staging;"));
    expect(queryForEditorGroup(result.current.editorGroupStates.primary)).toBe(
      "select staging;",
    );

    // Switching back restores what was left there, rather than whatever the
    // other connection happened to be showing.
    activate("prod");
    expect(queryForEditorGroup(result.current.editorGroupStates.primary)).toBe(
      "select prod;",
    );
  });

  it("keeps a connection's tabs across a reload", () => {
    const first = editorGroups();
    act(() => first.result.current.setEditorGroupQuery("primary", "select a;"));
    activate("staging");
    act(() => first.result.current.setEditorGroupQuery("primary", "select b;"));

    // The debounce is bypassed by the explicit flush the window close uses.
    act(() => {
      window.dispatchEvent(new Event("irodori:flush-editor-tabs"));
    });
    first.unmount();

    useConnectionStore.setState({ activeConnectionId: "prod" });
    const second = editorGroups();
    expect(
      queryForEditorGroup(second.result.current.editorGroupStates.primary),
    ).toBe("select a;");
    activate("staging");
    expect(
      queryForEditorGroup(second.result.current.editorGroupStates.primary),
    ).toBe("select b;");
  });

  it("adopts the pre-connection layout exactly once", () => {
    // v1 had no connection dimension. Its text has to survive the upgrade, but
    // only into the first workspace — otherwise every connection would open
    // holding a copy of the same restored SQL.
    window.localStorage.setItem(
      "irodori.editorTabs.v1",
      JSON.stringify({
        primary: {
          tabs: [{ id: "scratch", label: "scratch" }],
          activeTabId: "scratch",
          openTabIds: ["scratch"],
          queryByTabId: { scratch: "select carried_over;" },
          selectionsByTabId: { scratch: [{ from: 0, to: 0 }] },
        },
      }),
    );

    const { result } = editorGroups();
    expect(queryForEditorGroup(result.current.editorGroupStates.primary)).toBe(
      "select carried_over;",
    );

    activate("staging");
    expect(
      queryForEditorGroup(result.current.editorGroupStates.primary),
    ).not.toBe("select carried_over;");
  });
});
