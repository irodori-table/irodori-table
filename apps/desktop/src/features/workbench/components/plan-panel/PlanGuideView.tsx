import { Zap } from "lucide-react";
import { memo } from "react";
import type { QueryPlanAnalysis } from "@/generated/irodori-api";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

export const GuideView = memo(function GuideView({
  plan,
}: {
  plan: QueryPlanAnalysis;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  return (
    <section className="plan-section flush">
      <div className="plan-section-title">
        <Zap size={14} />
        <span>{t("plan.view.guide")}</span>
      </div>
      <div className="plan-guide-list">
        {plan.metricGuide.map((guide) => (
          <article key={guide.key}>
            <strong>{guide.label}</strong>
            <span>{guide.meaning}</span>
            <small>Good: {guide.good}</small>
            <small>Watch: {guide.warning}</small>
          </article>
        ))}
      </div>
    </section>
  );
});
