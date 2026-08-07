import type { WorkbenchViewId } from "@/features/workbench/types";
import type { HostFeatureId } from "./runtime-store";

/**
 * Workbench views that only exist while a declarative feature extension is
 * installed and enabled (#196, packaging model from #197).
 *
 * The pairing was written out by hand at six points in `useSidebarViews` —
 * `knowledge: !enabled.includes("knowledge")`, `lakehouse:
 * !enabled.includes("datalake")`, and four `viewId === "knowledge" || viewId
 * === "lakehouse"` guards. Every one of them is load-bearing: each is a route
 * by which a view whose extension is absent can reappear (the switcher, the
 * show/hide checklist, activation, un-hiding, the auto-close effect). Six
 * copies of the same fact is five chances to add the seventh route and forget.
 *
 * Note the names differ on purpose: the view is `lakehouse`, the host feature
 * is `datalake`. That mismatch is precisely the sort of thing a table should
 * state once rather than have every call site restate — and it is why a naive
 * `enabled.includes(viewId)` would silently gate the wrong thing.
 *
 * Sibling of `host-feature-commands.ts`, which does the same for commands.
 */
const hostFeatureViews: Readonly<
  Partial<Record<WorkbenchViewId, HostFeatureId>>
> = {
  knowledge: "knowledge",
  lakehouse: "datalake",
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
