// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorGroups } from "@/app/controllers/use-editor-groups";
import {
  noOpenTabId,
  openTabsForEditorGroup,
  queryForEditorGroup,
} from "@/app/editor-tabs";

/**
 * Now that the last tab can be closed, a group can hold no buffer at all —
 * a state every "load this SQL into the editor" path has to survive. History
 * restore, query magics and ERD export all write through
 * `setEditorGroupQuery`, and with no active tab there is nothing to write
 * into: the text would land under an id that renders nowhere and the command
 * would look like it did nothing.
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

describe("useEditorGroups with every tab closed", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens a tab for SQL loaded into an empty group", () => {
    const { result } = editorGroups();

    // One tab per act(): `closeSqlTab` reads the state its render closed over,
    // so batching the closes would replay them against the same snapshot.
    while (
      openTabsForEditorGroup(result.current.editorGroupStates.primary).length >
      0
    ) {
      const [tab] = openTabsForEditorGroup(
        result.current.editorGroupStates.primary,
      );
      act(() => result.current.closeSqlTab("primary", tab.id));
    }
    expect(result.current.editorGroupStates.primary.activeTabId).toBe(
      noOpenTabId,
    );

    act(() => {
      result.current.setEditorGroupQuery("primary", "select restored;");
    });

    const primary = result.current.editorGroupStates.primary;
    expect(openTabsForEditorGroup(primary)).toHaveLength(1);
    expect(queryForEditorGroup(primary)).toBe("select restored;");
  });

  it("still writes into the active tab when one is open", () => {
    const { result } = editorGroups();
    const openCount = openTabsForEditorGroup(
      result.current.editorGroupStates.primary,
    ).length;

    act(() => {
      result.current.setEditorGroupQuery("primary", "select edited;");
    });

    const primary = result.current.editorGroupStates.primary;
    expect(openTabsForEditorGroup(primary)).toHaveLength(openCount);
    expect(queryForEditorGroup(primary)).toBe("select edited;");
  });
});
