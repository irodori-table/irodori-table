import { BarChart3, X } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import type { QueryResultSet } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";
import { buildBiResultSummary } from "../bi-result";
import type { ChartResultModel } from "../chart-result";
import { ChartResultView } from "./ChartResultView";

type BiPanelProps = {
  result: QueryResultSet | null;
  chartModel: ChartResultModel | null;
  chartAvailable: boolean;
  onOpenChartMode: () => void;
  onClose: () => void;
};

export function BiPanel({
  result,
  chartModel,
  chartAvailable,
  onOpenChartMode,
  onClose,
}: BiPanelProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const summary = buildBiResultSummary(result, chartModel, locale);
  const visibleProfiles = summary?.profiles.slice(0, 12) ?? [];
  const hiddenProfileCount = summary
    ? Math.max(0, summary.profiles.length - visibleProfiles.length)
    : 0;

  return (
    <section className="bi-panel" aria-label={t("bi.title")}>
      <div className="bi-panel-header">
        <div>
          <strong>{t("bi.title")}</strong>
          <span>{summary?.statusLabel ?? t("bi.noActiveResult")}</span>
        </div>
        <button
          type="button"
          title={t("bi.close")}
          aria-label={t("bi.close")}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="bi-panel-body">
        {summary ? (
          <div className="bi-summary" aria-label={t("bi.resultSummary")}>
            <div>
              <strong>{summary.rowCountLabel}</strong>
              <span>{summary.columnCountLabel}</span>
            </div>
            <div>
              <strong>{summary.elapsedLabel}</strong>
              <span>{summary.sampleLabel ?? t("bi.summary.notSampled")}</span>
            </div>
          </div>
        ) : null}
        {chartModel ? (
          <>
            <ChartResultView model={chartModel} />
            <div className="bi-field-list" aria-label={t("bi.fields")}>
              <strong>{t("bi.fieldsHeading")}</strong>
              {visibleProfiles.map((profile) => (
                <div
                  className="bi-field-row"
                  key={`${profile.index}-${profile.name}`}
                >
                  <span>{profile.name}</span>
                  <small>{profile.roleLabel}</small>
                  <em>
                    {profile.kindLabel}
                    {" · "}
                    {profile.filledLabel}
                    {profile.distinctLabel ? ` · ${profile.distinctLabel}` : ""}
                  </em>
                </div>
              ))}
              {hiddenProfileCount > 0 ? (
                <div className="bi-field-more">
                  {t("bi.moreFields", {
                    count: hiddenProfileCount.toLocaleString(locale),
                  })}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="bi-panel-empty">
            <BarChart3 size={18} />
            <strong>
              {result ? t("bi.noChartableResult") : t("bi.noActiveResult")}
            </strong>
            <span>
              {result ? t("bi.noChartableHint") : t("bi.runQueryHint")}
            </span>
            {chartAvailable ? (
              <button
                className="text-button"
                type="button"
                onClick={onOpenChartMode}
              >
                {t("bi.openChart")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
