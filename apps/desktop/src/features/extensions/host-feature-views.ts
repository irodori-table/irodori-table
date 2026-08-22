import type { WorkbenchViewId } from "@/features/workbench/types";
import type { HostFeatureId } from "./runtime-store";

/**
 * Workbench views that only exist while a declarative feature extension is
 * installed and enabled (#196, packaging model from #197).
 *
 * The pairing was written out by hand at six points in `useSidebarViews` —
 * `knowledge: !enabled.includes("knowledge")` and five `viewId === "knowledge"`
 * guards. Every one of them is load-bearing: each is a route by which a view
 * whose extension is absent can reappear (the switcher, the show/hide
 * checklist, activation, un-hiding, the auto-close effect). Six copies of the
 * same fact is five chances to add the seventh route and forget.
 *
 * The view id and the host feature id are separate on purpose: they have
 * matched so far, but a naive `enabled.includes(viewId)` would silently gate
 * the wrong thing the moment they do not (the Lakehouse view was gated on a
 * feature named `datalake` before it moved to the irodori-lakehouse repo).
 *
 * Sibling of `host-feature-commands.ts`, which does the same for commands.
 */
const hostFeatureViews: Readonly<
  Partial<Record<WorkbenchViewId, HostFeatureId>>
> = {
  knowledge: "knowledge",
};

/** The host feature a view depends on, or null when the view is always available. */
export function hostFeatureForView(
  viewId: WorkbenchViewId,
): HostFeatureId | null {
  return hostFeatureViews[viewId] ?? null;
}

/** View ids gated on a host feature. Exported for the coverage check. */
export function hostFeatureViewIds(): readonly WorkbenchViewId[] {
  return Object.keys(hostFeatureViews) as WorkbenchViewId[];
}

/**
 * Whether a view cannot be shown because its host feature is not enabled.
 *
 * Ungated views always answer false, so call sites can ask about any view
 * without first checking whether the question applies.
 */
export function isViewUnavailable(
  viewId: WorkbenchViewId,
  enabledHostFeatures: readonly HostFeatureId[],
): boolean {
  const feature = hostFeatureForView(viewId);
  return feature !== null && !enabledHostFeatures.includes(feature);
}

/**
 * The gated views that are currently unavailable, as the partial hidden map
 * `workbenchViewsForSide` takes.
 */
export function unavailableHostFeatureViews(
  enabledHostFeatures: readonly HostFeatureId[],
): Partial<Record<WorkbenchViewId, boolean>> {
  const unavailable: Partial<Record<WorkbenchViewId, boolean>> = {};
  for (const viewId of hostFeatureViewIds()) {
    unavailable[viewId] = isViewUnavailable(viewId, enabledHostFeatures);
  }
  return unavailable;
}
