import { AlertTriangle, Play, Zap } from "lucide-react";
import { CloseButton } from "@/components/CloseButton";
import type {
  QueryPlanAnalysis,
  QueryPlanCopyFormat,
} from "@/generated/irodori-api";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import { PlanAnalysis } from "./plan-panel";

type PlanPanelProps = {
  plan: QueryPlanAnalysis | null;
  loading: boolean;
  error: string | null;
  activeConnectionOpen: boolean;
  activeConnectionName: string;
  onExplainPlan: () => void;
  onExplainAnalyze: () => void;
  onCopyFormat: (format: QueryPlanCopyFormat) => void;
  onClose: () => void;
};

export function PlanPanel({
  plan,
  loading,
  error,
  activeConnectionOpen,
  activeConnectionName,
  onExplainPlan,
  onExplainAnalyze,
  onCopyFormat,
  onClose,
}: PlanPanelProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  return (
    <section className="plan-panel" aria-label={t("plan.panelLabel")}>
      <div className="plan-panel-header">
        <div>
          <strong>{t("plan.title")}</strong>
          <span>{activeConnectionName}</span>
        </div>
        <CloseButton onClose={onClose} label={t("plan.close")} size={13} />
      </div>

      <div className="plan-actions">
        <button
          type="button"
          onClick={onExplainPlan}
          disabled={!activeConnectionOpen || loading}
          title={t("plan.explainPlan")}
        >
          <Play size={14} />
          <span>{t("plan.title")}</span>
        </button>
        <button
          type="button"
          onClick={onExplainAnalyze}
          disabled={!activeConnectionOpen || loading}
          title={t("plan.explainAnalyse")}
        >
          <Zap size={14} />
          <span>{t("plan.analyse")}</span>
        </button>
      </div>

      {!activeConnectionOpen ? (
        <div className="plan-empty">{t("plan.connectFirst")}</div>
      ) : loading ? (
        <div className="plan-empty loading">{t("plan.reading")}</div>
      ) : error ? (
        <div className="plan-error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      ) : !plan ? (
        <div className="plan-empty">{t("plan.runHint")}</div>
      ) : (
        <PlanAnalysis plan={plan} onCopyFormat={onCopyFormat} />
      )}
    </section>
  );
}
