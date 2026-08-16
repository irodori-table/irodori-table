// Structured log import profiles for `.log` buffers (issue #177, tier 4).
//
// Profiles turn the editor's immutable raw text into an ImportPreview-shaped
// data set. The workbench then uses the existing table/SQL preview flow, so a
// log can become queryable without adding a second import implementation.

import { parseImportText, type ParsedImport } from "@/features/import";
import { splitLogEntries, splitLogFilterLines } from "./editor-log-filter";
import { tokenizeLogLine, type LogTokenKind } from "./editor-log-highlight";

export const logProfileIds = ["auto", "common", "jsonl"] as const;

export type LogProfileId = (typeof logProfileIds)[number];
export type ResolvedLogProfileId = Exclude<LogProfileId, "auto">;

export type LogProfileImportRequest = {
  fileName: string;
  text: string;
  profileId: LogProfileId;
};

export type ParsedLogProfile = ParsedImport & {
  profileId: ResolvedLogProfileId;
};

const commonLogColumns = [
  "line",
  "end_line",
  "timestamp",
  "level",
  "message",
  "raw",
] as const;

const severityKinds = new Set<LogTokenKind>([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
]);

/** Parse editor text with a selected built-in profile. */
export function parseLogWithProfile(
  text: string,
  profileId: LogProfileId,
  maxRows = 10_000,
): ParsedLogProfile {
  if (profileId === "jsonl") {
    return parseJsonLinesProfile(text, maxRows);
  }
  if (profileId === "auto" && looksLikeJsonLines(text)) {
    try {
      return parseJsonLinesProfile(text, maxRows);
    } catch {
      // Auto detection is deliberately forgiving. A half-written JSON object
      // is still a perfectly valid common-text log line.
    }
  }
  return parseCommonLogProfile(text, maxRows);
}

function parseJsonLinesProfile(
  text: string,
  maxRows: number,
): ParsedLogProfile {
  return {
    ...parseImportText(text, "jsonl", maxRows),
    profileId: "jsonl",
  };
}

function looksLikeJsonLines(text: string): boolean {
  const lines = splitLogFilterLines(text)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => line.startsWith("{"));
}

function parseCommonLogProfile(
  text: string,
  maxRows: number,
): ParsedLogProfile {
  const lines = sourceLines(text);
  if (lines.length === 0) {
    return {
      profileId: "common",
      columns: [...commonLogColumns],
      rows: [],
      totalRows: 0,
      truncated: false,
    };
  }

  const hasStructuredHead = lines.some((line) => logHeadTokens(line).length);
  const entries = hasStructuredHead
    ? splitLogEntries(lines)
    : lines
        .map((line, index) => ({
          fromLine: index,
          toLine: index,
          severity: null,
          line,
        }))
        .filter(({ line }) => line.trim() !== "");
  const allRows = entries
    .filter(({ fromLine, toLine }) =>
      lines.slice(fromLine, toLine + 1).some((line) => line.trim() !== ""),
    )
    .map(({ fromLine, toLine }) => commonLogRow(lines, fromLine, toLine));
  const rows = allRows.slice(0, Math.max(0, maxRows));

  return {
    profileId: "common",
    columns: [...commonLogColumns],
    rows,
    totalRows: allRows.length,
    truncated: rows.length < allRows.length,
  };
}

function sourceLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = splitLogFilterLines(text);
  // Splitting a newline-terminated file produces one synthetic empty line.
  // Keep meaningful interior blank lines as entry continuations, but not that
  // trailing artefact.
  if (/\r\n$|[\r\n]$/.test(text) && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function logHeadTokens(line: string) {
  return tokenizeLogLine(line).filter(
    (token) => token.kind === "timestamp" || severityKinds.has(token.kind),
  );
}

function commonLogRow(
  lines: readonly string[],
  fromLine: number,
  toLine: number,
): unknown[] {
  const entryLines = lines.slice(fromLine, toLine + 1);
  const head = entryLines[0] ?? "";
  const tokens = logHeadTokens(head);
  const timestamp = tokens.find((token) => token.kind === "timestamp");
  const severity = tokens.find((token) => severityKinds.has(token.kind));
  const prefixEnd = tokens.reduce((end, token) => Math.max(end, token.to), 0);
  const messageHead =
    prefixEnd > 0
      ? head
          .slice(prefixEnd)
          .replace(/^[\s[\](){}:;|,=-]+/, "")
          .trimEnd()
      : head.trimEnd();
  const message = [messageHead, ...entryLines.slice(1)].join("\n").trimEnd();

  return [
    fromLine + 1,
    toLine + 1,
    timestamp ? head.slice(timestamp.from, timestamp.to) : null,
    severity ? severity.kind.toUpperCase() : null,
    message,
    entryLines.join("\n"),
  ];
}
