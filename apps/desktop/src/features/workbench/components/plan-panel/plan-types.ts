import type { TranslationKey } from "@/i18n";

export type PlanView =
  | "overview"
  | "tree"
  | "table"
  | "graph"
  | "flame"
  | "guide"
  | "copy";

export type PlanNodeSelector = (nodeId: string | undefined) => void;

/**
 * The view tabs, carrying a translation key rather than an English label so
 * the tab strip follows the app language (#170).
 */
export const planViews: Array<{ id: PlanView; labelKey: TranslationKey }> = [
  { id: "overview", labelKey: "plan.view.overview" },
  { id: "tree", labelKey: "plan.view.tree" },
  { id: "table", labelKey: "plan.view.table" },
  { id: "graph", labelKey: "plan.view.graph" },
  { id: "flame", labelKey: "plan.view.flame" },
  { id: "guide", labelKey: "plan.view.guide" },
  { id: "copy", labelKey: "plan.view.copy" },
];
