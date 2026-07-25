import { Copy } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type {
  QueryPlanAnalysis,
  QueryPlanCopyFormat,
  QueryPlanFinding,
  QueryPlanNode,
} from "@/generated/irodori-api";
import { nodeCopyFormat } from "./plan-format";

export function CopyView({
  plan,
  selectedNode,
  selectedNodeFindings,
  onCopyFormat,
}: {
  plan: QueryPlanAnalysis;
  selectedNode: QueryPlanNode | null;
  selectedNodeFindings: QueryPlanFinding[];
  onCopyFormat: (format: QueryPlanCopyFormat) => void;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  return (
    <section className="plan-section flush">
      <div className="plan-section-title">
        <Copy size={14} />
        <span>{t("plan.view.copy")}</span>
      </div>
      <div className="plan-copy-list">
        {plan.copyFormats.map((format) => (
          <button
            type="button"
            key={format.label}
            onClick={() => onCopyFormat(format)}
          >
            <Copy size={13} />
            <span>{format.label}</span>
          </button>
        ))}
        {selectedNode ? (
          <button
            type="button"
            onClick={() =>
              onCopyFormat(nodeCopyFormat(selectedNode, selectedNodeFindings))
            }
          >
            <Copy size={13} />
            <span>{t("plan.selectedNodeHeading")}</span>
          </button>
        ) : null}
      </div>
      <pre className="plan-copy-preview">{plan.sql}</pre>
    </section>
  );
}
