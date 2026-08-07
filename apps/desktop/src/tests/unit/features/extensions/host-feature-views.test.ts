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
  it("gates exactly Knowledge and Lakehouse today", () => {
    // Deliberately exact: gaining or losing a gated view has to be a decision,
    // because every entry here is a view that disappears from a standard build.
    expect([...hostFeatureViewIds()].sort()).toEqual([
      "knowledge",
      "lakehouse",
    ]);
  });

  it("names views and features that exist", () => {
    for (const viewId of hostFeatureViewIds()) {
      expect(workbenchViewIds).toContain(viewId);
      expect(hostFeatureIds).toContain(hostFeatureForView(viewId));
    }
  });

  it("maps the Lakehouse view to the datalake feature, not to its own name", () => {
    // The trap this table exists to hold: the view and the feature are spelled
    // differently. `enabledHostFeatures.includes(viewId)` looks right and gates
    // the wrong thing — silently, because "lakehouse" is simply never enabled.
    expect(hostFeatureForView("lakehouse")).toBe("datalake");
    expect(hostFeatureForView("knowledge")).toBe("knowledge");
  });

  it("treats an ungated view as always available", () => {
    expect(hostFeatureForView("objectBrowser")).toBeNull();
    expect(isViewUnavailable("objectBrowser", [])).toBe(false);
  });

  it("reports a gated view unavailable until its feature is enabled", () => {
    expect(isViewUnavailable("lakehouse", [])).toBe(true);
    expect(isViewUnavailable("lakehouse", ["knowledge"])).toBe(true);
    expect(isViewUnavailable("lakehouse", ["datalake"])).toBe(false);
  });

  it("builds a hidden map covering every gated view and nothing else", () => {
    expect(unavailableHostFeatureViews([])).toEqual({
      knowledge: true,
      lakehouse: true,
    });
    expect(unavailableHostFeatureViews(["knowledge", "datalake"])).toEqual({
      knowledge: false,
      lakehouse: false,
    });
  });
});
