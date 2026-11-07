import type { DbEngine } from "@/generated/irodori-api";
import { lintSqlDocument, type SqlLinterId } from "@/sql/linter";

export type SqlProblemTab = {
  key: string;
  group: string;
  tabId: string;
  label: string;
  text: string;
};

export type SqlProblemSeverity = "error" | "warning" | "info" | "hint";

export type SqlProblem = {
  id: string;
  tabKey: string;
  group: string;
  tabId: string;
  label: string;
  text: string;
  from: number;
  to: number;
  line: number;
  column: number;
  severity: SqlProblemSeverity;
  message: string;
};

export type SqlProblemCounts = {
  errors: number;
  warnings: number;
  total: number;
};

/** Table tabs are read-only data views, not SQL buffers. */
export function isSqlBufferTab(tabId: string) {
  return !tabId.startsWith("table:");
}

export function positionAt(text: string, offset: number) {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastBreak = -1;
  for (let index = 0; index < safe; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lastBreak = index;
    }
  }
  return { line, column: safe - lastBreak };
}

/**
 * Collect the linter diagnostics for every open SQL buffer. The linter itself
 * is bounded (`MAX_DIAGNOSTICS` per document), and a disabled linter produces
 * no work and no problems.
 */
export function collectSqlProblems(
  tabs: readonly SqlProblemTab[],
  engine: DbEngine,
  linter: SqlLinterId,
): SqlProblem[] {
  if (linter === "disabled") {
    return [];
  }
  const problems: SqlProblem[] = [];
  for (const tab of tabs) {
    if (!isSqlBufferTab(tab.tabId) || !tab.text.trim()) {
      continue;
    }
    for (const diagnostic of lintSqlDocument(tab.text, engine)) {
      const { line, column } = positionAt(tab.text, diagnostic.from);
      problems.push({
        id: `${tab.key}:${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`,
        tabKey: tab.key,
        group: tab.group,
        tabId: tab.tabId,
        label: tab.label,
        text: tab.text,
        from: diagnostic.from,
        to: diagnostic.to,
        line,
        column,
        severity: diagnostic.severity ?? "warning",
        message: diagnostic.message,
      });
    }
  }
  return problems;
}

export function problemCounts(
  problems: readonly SqlProblem[],
): SqlProblemCounts {
  let errors = 0;
  let warnings = 0;
  for (const problem of problems) {
    if (problem.severity === "error") {
      errors += 1;
    } else if (problem.severity === "warning") {
      warnings += 1;
    }
  }
  return { errors, warnings, total: problems.length };
}

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

/** Case-insensitive, full-width-normalized multi-term filter. */
export function filterSqlProblems(
  problems: readonly SqlProblem[],
  query: string,
): SqlProblem[] {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return [...problems];
  }
  return problems.filter((problem) => {
    const text = normalize(
      [
        problem.message,
        problem.label,
        problem.severity,
        `${problem.line}:${problem.column}`,
        `${problem.line}`,
      ].join(" "),
    );
    return tokens.every((token) => text.includes(token));
  });
}
