import { describe, expect, it } from "vitest";
import {
  hostFeatureForView,
  hostFeatureViewIds,
  isViewUnavailable,
  unavailableHostFeatureViews,
} from "@/features/extensions/host-feature-views";
import { hostFeatureIds } from "@/features/extensions/runtime-store";
import { workbenchViewIds } from "@/features/workbench/types";

/**
 * The gate used to be written out at six points in `useSidebarViews`. These
 * assertions are what makes one table safe to rely on instead.
 */
describe("views gated on a host feature", () => {
  it("gates exactly Knowledge today", () => {
    // Deliberately exact: gaining or losing a gated view has to be a decision,
    // because every entry here is a view that disappears from a standard build.
    // Lakehouse was the second entry until the panel moved to irodori-lakehouse.
    expect([...hostFeatureViewIds()].sort()).toEqual(["knowledge"]);
  });

  it("names views and features that exist", () => {
    for (const viewId of hostFeatureViewIds()) {
      expect(workbenchViewIds).toContain(viewId);
      expect(hostFeatureIds).toContain(hostFeatureForView(viewId));
    }
  });

  it("maps a view to its feature through the table, not by name", () => {
    // The trap this table exists to hold: view id and feature id are separate
    // namespaces. `enabledHostFeatures.includes(viewId)` looks right and gates
    // the wrong thing the moment the two names differ — silently, because the
    // view id is then simply never enabled.
    expect(hostFeatureForView("knowledge")).toBe("knowledge");
  });

  it("treats an ungated view as always available", () => {
    expect(hostFeatureForView("objectBrowser")).toBeNull();
    expect(isViewUnavailable("objectBrowser", [])).toBe(false);
  });

  it("reports a gated view unavailable until its feature is enabled", () => {
    expect(isViewUnavailable("knowledge", [])).toBe(true);
    expect(isViewUnavailable("knowledge", ["knowledge"])).toBe(false);
  });

  it("builds a hidden map covering every gated view and nothing else", () => {
    expect(unavailableHostFeatureViews([])).toEqual({ knowledge: true });
    expect(unavailableHostFeatureViews(["knowledge"])).toEqual({
      knowledge: false,
    });
  });
});
