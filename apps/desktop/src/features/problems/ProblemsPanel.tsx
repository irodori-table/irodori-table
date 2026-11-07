import { useMemo, useState } from "react";
import { CircleAlert, Info, Search, TriangleAlert, X } from "lucide-react";
import { CloseButton } from "@/components/CloseButton";
import type { Translator } from "@/i18n";
import {
  filterSqlProblems,
  problemCounts,
  type SqlProblem,
  type SqlProblemSeverity,
} from "./sql-problems";
import "./problems.css";

const severityIcons: Record<SqlProblemSeverity, typeof CircleAlert> = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  hint: Info,
};

const severityLabelKeys = {
  error: "problems.severity.error",
  warning: "problems.severity.warning",
  info: "problems.severity.info",
  hint: "problems.severity.hint",
} as const;

export function ProblemsPanel({
  problems,
  onOpen,
  onClose,
  t,
}: {
  problems: readonly SqlProblem[];
  onOpen: (problem: SqlProblem) => void;
  onClose: () => void;
  t: Translator["t"];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterSqlProblems(problems, query),
    [problems, query],
  );
  const counts = problemCounts(problems);

  return (
    <section className="problems-panel" aria-label={t("problems.title")}>
      <div className="problems-header">
        <div>
          <strong>{t("problems.title")}</strong>
          <span>
            {t("problems.errors", { count: counts.errors })}
            {" · "}
            {t("problems.warnings", { count: counts.warnings })}
          </span>
        </div>
        <CloseButton onClose={onClose} label={t("problems.close")} />
      </div>

      <label className="problems-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t("problems.searchPlaceholder")}
          aria-label={t("problems.search")}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query ? (
          <button
            type="button"
            className="icon-button"
            aria-label={t("problems.clearFilter")}
            title={t("problems.clearFilter")}
            onClick={() => setQuery("")}
          >
            <X size={14} />
          </button>
        ) : null}
      </label>

      <div className="problems-list">
        {problems.length === 0 ? (
          <div className="problems-empty" role="status">
            {t("problems.noProblems")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="problems-empty" role="status">
            {t("problems.noMatches")}
          </div>
        ) : (
          filtered.map((problem) => {
            const Icon = severityIcons[problem.severity];
            const location = t("problems.location", {
              file: problem.label,
              line: problem.line,
              column: problem.column,
            });
            return (
              <button
                key={problem.id}
                type="button"
                className={`problems-item is-${problem.severity}`}
                title={t("problems.open", { location })}
                onClick={() => onOpen(problem)}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="problems-message">{problem.message}</span>
                <span className="problems-location">{location}</span>
                <span className="problems-severity">
                  {t(severityLabelKeys[problem.severity])}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
