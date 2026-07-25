import { AlertTriangle, Sparkles } from "lucide-react";
import { memo, useEffect, useState } from "react";
import {
  aiEngineStatus,
  aiExplainPlan,
  aiGetProvider,
  type QueryPlanAnalysis,
} from "@/generated/irodori-api";
import { errorMessage } from "@/core";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

export const PlanAiExplanation = memo(function PlanAiExplanation({
  plan,
}: {
  plan: QueryPlanAnalysis;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNarration(null);
    setNarrationError(null);
    setNarrating(false);
    setProviderReady(null);

    void (async () => {
      try {
        const provider = await aiGetProvider();
        let usable = Boolean(provider?.kind);
        if (provider?.kind === "local") {
          const status = await aiEngineStatus().catch(() => null);
          usable = Boolean(status && status.compiled && status.modelPresent);
        }
        if (!cancelled) setProviderReady(usable);
      } catch {
        if (!cancelled) setProviderReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plan]);

  const explain = async () => {
    if (narrating) return;
    setNarrating(true);
    setNarrationError(null);
    try {
      const text = await aiExplainPlan(plan);
      setNarration(text);
    } catch (err) {
      setNarrationError(errorMessage(err));
    } finally {
      setNarrating(false);
    }
  };

  return (
    <section className="plan-section compact plan-ai-explanation">
      <div className="plan-section-title">
        <Sparkles size={14} />
        <span>{t("plan.ai.heading")}</span>
      </div>

      {providerReady === false ? (
        <div className="plan-empty-card">{t("plan.ai.configureProvider")}</div>
      ) : (
        <>
          <button
            type="button"
            className="plan-ai-explain-button"
            onClick={explain}
            disabled={providerReady !== true || narrating}
            aria-label={t("plan.ai.buttonLabel")}
          >
            <Sparkles size={13} />
            <span>
              {narrating ? t("plan.ai.explaining") : t("plan.ai.explainWithAi")}
            </span>
          </button>

          {narrationError ? (
            <div className="plan-error" role="alert">
              <AlertTriangle size={15} />
              <span>{narrationError}</span>
            </div>
          ) : null}

          {narration ? (
            <p className="plan-ai-narration" style={{ whiteSpace: "pre-wrap" }}>
              {narration}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
});
