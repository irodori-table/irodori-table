import type { DbEngine } from "../generated/irodori-api";
import completionKeywordsConfig from "./completion-keywords.json";
import { isRecord } from "@/core";

export const SQL_COMPLETION_KEYWORDS_SCHEMA_VERSION = 2;

type CompletionKeywordConfig = {
  schemaVersion?: unknown;
  common?: unknown;
  sqlCommonEngines?: unknown;
  engines?: unknown;
};

const keywordConfig =
  completionKeywordsConfig as unknown as CompletionKeywordConfig;

validateKeywordSchemaVersion(keywordConfig.schemaVersion);

export const commonSqlCompletionKeywords = keywordList(
  keywordConfig.common,
  "completionKeywords.common",
);

/**
 * Engines whose query language is a SQL dialect, so the shared `common` list
 * (select/from/where/…) applies on top of their own terms. Everything else — a
 * document, key-value, graph or vector store — only gets its own dialect terms.
 *
 * This is deliberately not the snippet-engine list: PartiQL (DynamoDB), CQL and
 * SQL++ read as SQL at the keyword level while having no use for the SQL
 * statement snippets, and gating one on the other left those engines with no
 * completion at all.
 */
export const sqlCommonKeywordEngines: ReadonlySet<DbEngine> = new Set(
  keywordList(
    keywordConfig.sqlCommonEngines,
    "completionKeywords.sqlCommonEngines",
  ) as DbEngine[],
);

export const engineSqlCompletionKeywords = keywordMap(keywordConfig.engines);

function validateKeywordSchemaVersion(value: unknown): void {
  if (value !== SQL_COMPLETION_KEYWORDS_SCHEMA_VERSION) {
    throw new Error(
      `completionKeywords.schemaVersion must be ${SQL_COMPLETION_KEYWORDS_SCHEMA_VERSION}`,
    );
  }
}

function keywordMap(value: unknown): Partial<Record<DbEngine, string[]>> {
  if (!isRecord(value)) {
    throw new Error("completionKeywords.engines must be an object");
  }
  return Object.fromEntries(
    Object.entries(value).map(([engine, keywords]) => [
      engine,
      keywordList(keywords, `completionKeywords.engines.${engine}`),
    ]),
  ) as Partial<Record<DbEngine, string[]>>;
}

function keywordList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return value.map((keyword, index) => {
    if (typeof keyword !== "string" || keyword.trim().length === 0) {
      throw new Error(`${fieldName}[${index}] must be a non-empty string`);
    }
    return keyword.trim();
  });
}
