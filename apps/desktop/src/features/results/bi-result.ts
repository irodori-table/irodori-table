import { currentAppLocale } from "@/features/preferences";
import type { QueryResultSet } from "@/generated/irodori-api";
import { createTranslator, type TranslationKey, type Translator } from "@/i18n";
import type { ChartColumnKind, ChartResultColumn } from "./chart-result";
import type { ChartResultModel } from "./chart-result";
import { toCount } from "./result-format";

export const biColumnRoles = ["dimension", "measure", "time", "field"] as const;

export type BiColumnRole = (typeof biColumnRoles)[number];

export type BiColumnProfile = {
  index: number;
  name: string;
  role: BiColumnRole;
  roleLabel: string;
  filledLabel: string;
  distinctLabel: string | null;
  kindLabel: string;
};

export type BiResultSummary = {
  rowCountLabel: string;
  columnCountLabel: string;
  elapsedLabel: string;
  sampleLabel: string | null;
  statusLabel: string;
  profiles: BiColumnProfile[];
};

const roleKeys = {
  dimension: "bi.role.dimension",
  measure: "bi.role.measure",
  time: "bi.role.time",
  field: "bi.role.field",
} as const satisfies Record<BiColumnRole, TranslationKey>;

const kindKeys = {
  category: "bi.kind.category",
  date: "bi.kind.date",
  number: "bi.kind.number",
} as const satisfies Record<ChartColumnKind, TranslationKey>;

/**
 * Build the BI panel's labels.
 *
 * The locale drives both halves: number grouping through `toLocaleString`, and
 * the words around the numbers through the translator. Before #170 only the
 * first half followed the setting, so a Japanese user saw "1,234 rows".
 */
export function buildBiResultSummary(
  result: QueryResultSet | null,
  chartModel: ChartResultModel | null,
  locale: string = currentAppLocale(),
): BiResultSummary | null {
  if (!result) {
    return null;
  }
  const { t } = createTranslator(locale);

  const profiles = chartModel
    ? chartModel.columns.map((column) =>
        profileFromChartColumn(column, t, locale),
      )
    : result.columns.map((name, index) => ({
        index,
        name,
        role: "field" as const,
        roleLabel: t("bi.role.field"),
        filledLabel: t("bi.summary.notSampled"),
        distinctLabel: null,
        kindLabel: t("bi.kind.field"),
      }));

  return {
    rowCountLabel: t("bi.summary.rows", {
      count: toCount(result.rowCount, locale),
    }),
    columnCountLabel: t("bi.summary.columns", {
      count: toCount(result.columns.length, locale),
    }),
    elapsedLabel: formatElapsed(result.elapsedMs, t, locale),
    sampleLabel: chartModel
      ? chartModel.truncated
        ? t("bi.summary.sampledOf", {
            count: toCount(chartModel.sampledRows, locale),
            total: toCount(chartModel.sourceRows, locale),
          })
        : t("bi.summary.sampled", {
            count: toCount(chartModel.sampledRows, locale),
          })
      : null,
    statusLabel: result.truncated
      ? t("bi.summary.statusTruncated")
      : t("bi.summary.statusCurrent"),
    profiles,
  };
}

function profileFromChartColumn(
  column: ChartResultColumn,
  t: Translator["t"],
  locale: string,
): BiColumnProfile {
  const role = roleFromChartColumn(column);
  return {
    index: column.index,
    name: column.name,
    role,
    roleLabel: t(roleKeys[role]),
    filledLabel: t("bi.field.filled", {
      count: toCount(column.filledCount, locale),
    }),
    distinctLabel:
      column.kind === "category"
        ? t("bi.field.distinct", {
            count: toCount(column.distinctCount, locale),
          })
        : null,
    kindLabel: t(kindKeys[column.kind]),
  };
}

function roleFromChartColumn(column: ChartResultColumn): BiColumnRole {
  if (column.kind === "number") {
    return "measure";
  }
  if (column.kind === "date") {
    return "time";
  }
  return "dimension";
}

function formatElapsed(elapsedMs: bigint, t: Translator["t"], locale: string) {
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(elapsed)) {
    return t("bi.summary.elapsedUnknown");
  }
  if (elapsed < 1_000) {
    return t("bi.summary.elapsedMs", { value: elapsed.toLocaleString(locale) });
  }
  return t("bi.summary.elapsedSeconds", {
    value: (elapsed / 1_000).toLocaleString(locale, {
      maximumFractionDigits: 2,
    }),
  });
}
