import { Flame } from "lucide-react";
import type { PlanFlameRow } from "./plan-model";
import type { PlanNodeSelector } from "./plan-types";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

export function FlameView({
  rows,
  selectedNodeId,
  onSelectNode,
}: {
  rows: PlanFlameRow[];
  selectedNodeId: string | null;
  onSelectNode: PlanNodeSelector;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  return (
    <section className="plan-section flush">
      <div className="plan-section-title">
        <Flame size={14} />
        <span>{t("plan.view.flame")}</span>
      </div>
      <div className="plan-flame-list">
        {rows.map((row) => (
          <button
            type="button"
            className={`plan-flame-row${row.id === selectedNodeId ? " active" : ""}`}
            key={row.id}
            onClick={() => onSelectNode(row.id)}
          >
            <span style={{ paddingLeft: `${Math.min(row.depth, 5) * 12}px` }}>
              {row.label}
            </span>
            <i>
              <b style={{ width: `${Math.max(6, row.ratio * 100)}%` }} />
            </i>
            <small>{row.value}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
