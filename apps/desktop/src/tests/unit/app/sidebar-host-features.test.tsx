// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSidebarViews } from "@/app/controllers/use-sidebar-views";
import { useExtensionRuntimeStore } from "@/features/extensions/runtime-store";
import { useWorkbenchStore } from "@/features/workbench";
import {
  defaultWorkbenchViewHidden,
  defaultWorkbenchViewPlacements,
  defaultWorkbenchViewVisibility,
} from "@/features/workbench/types";
import type { InstalledExtension } from "@/generated/irodori-api";

/**
 * #196 extracts Knowledge and Lakehouse out of the standard product. The
 * packaging model that shipped (#197) keeps the panels compiled into the app
 * and gates them on a declarative feature extension being installed and
 * enabled, so the *gate* is the whole feature: with no extension installed the
 * views must be unreachable by every route the sidebar offers, and installing
 * the extension must bring them back.
 *
 * `deriveEnabledHostFeatures` is covered in
 * features/extensions/runtime-store.test.ts. What had no test at all is the
 * consumer — `useSidebarViews`, where the gate is applied in five separate
 * places (the hidden map, the switcher checklist, activation, un-hiding, and
 * the auto-close effect). Each one is a way for the feature to leak back into
 * a standard build.
 */

const knowledgeExtension: InstalledExtension = {
  id: "irodori.knowledge",
  name: "Irodori Knowledge",
  version: "0.1.0",
  runtime: "declarative",
  hostFeatures: ["knowledge"],
  sha256: "a".repeat(64),
  enabled: true,
  installedAt: "0",
  supportedCalls: [],
};

const datalakeExtension: InstalledExtension = {
  ...knowledgeExtension,
  id: "irodori.datalake",
  name: "Irodori Datalake",
  hostFeatures: ["datalake"],
};

// Seeding through the setter also flips `loaded`, which is what stops the hook
// from reaching for the real `extList` Tauri command on mount.
function installExtensions(...extensions: InstalledExtension[]) {
  useExtensionRuntimeStore.getState().setInstalledExtensions(extensions);
}

beforeEach(() => {
  useWorkbenchStore.setState({
    sidebarOpen: true,
    rightSidebarOpen: true,
    viewPlacements: { ...defaultWorkbenchViewPlacements },
    viewVisibility: { ...defaultWorkbenchViewVisibility },
    viewHidden: { ...defaultWorkbenchViewHidden },
  });
  installExtensions();
});

describe("workbench views gated on a feature extension", () => {
  it("hides Knowledge and Lakehouse when no feature extension is installed", () => {
    const { result } = renderHook(() => useSidebarViews());

    expect(result.current.enabledHostFeatures).toEqual([]);
    expect(result.current.viewHidden.knowledge).toBe(true);
    expect(result.current.viewHidden.lakehouse).toBe(true);
    expect(result.current.rightSidebarViews).not.toContain("knowledge");
    expect(result.current.rightSidebarViews).not.toContain("lakehouse");
  });

  it("keeps them out of the switcher's show/hide checklist too", () => {
    // `*SidebarAllViews` lists hidden views on purpose, so the tab context menu
    // can offer them back. A view whose extension is absent must not appear
    // there either, or the checklist advertises a feature the build has no way
    // to turn on.
    const { result } = renderHook(() => useSidebarViews());

    expect(result.current.rightSidebarAllViews).not.toContain("knowledge");
    expect(result.current.rightSidebarAllViews).not.toContain("lakehouse");
  });

  it("restores each view when its extension is installed and enabled", () => {
    const { result } = renderHook(() => useSidebarViews());

    act(() => {
      installExtensions(knowledgeExtension, datalakeExtension);
    });

    expect(result.current.enabledHostFeatures).toEqual([
      "knowledge",
      "datalake",
    ]);
    expect(result.current.rightSidebarViews).toContain("knowledge");
    expect(result.current.rightSidebarViews).toContain("lakehouse");

    act(() => {
      result.current.setActiveSidebarView("knowledge");
    });
    expect(result.current.viewVisibility.knowledge).toBe(true);
    expect(result.current.activeRightSidebarView).toBe("knowledge");
  });

  it("ignores activation of a view whose extension is missing", () => {
    const { result } = renderHook(() => useSidebarViews());

    act(() => {
      result.current.setActiveSidebarView("lakehouse");
    });

    expect(result.current.viewVisibility.lakehouse).toBe(false);
    expect(result.current.activeRightSidebarView).not.toBe("lakehouse");
  });

  it("refuses to un-hide a view whose extension is missing", () => {
    // The un-hide guard is only observable on the *stored* flag: the derived
    // `viewHidden` stays true either way because the feature is unavailable.
    // Start from a view the user hid themselves — a refused un-hide must leave
    // that preference intact rather than silently clearing it, so installing
    // the extension later restores what the user chose, not a reset.
    useWorkbenchStore.setState((state) => ({
      viewHidden: { ...state.viewHidden, knowledge: true },
    }));
    const { result } = renderHook(() => useSidebarViews());

    act(() => {
      result.current.setViewHidden("knowledge", false);
    });

    expect(useWorkbenchStore.getState().viewHidden.knowledge).toBe(true);
    expect(result.current.viewHidden.knowledge).toBe(true);
    expect(useWorkbenchStore.getState().viewVisibility.knowledge).toBe(false);
  });

  it("closes an open view when its extension is disabled", () => {
    // Disabling an extension in Settings is a live state change, not a restart.
    const { result } = renderHook(() => useSidebarViews());

    act(() => {
      installExtensions(knowledgeExtension);
    });
    act(() => {
      result.current.setActiveSidebarView("knowledge");
    });
    expect(result.current.viewVisibility.knowledge).toBe(true);

    act(() => {
      installExtensions({ ...knowledgeExtension, enabled: false });
    });

    expect(result.current.viewVisibility.knowledge).toBe(false);
    expect(result.current.viewHidden.knowledge).toBe(true);
  });
});
