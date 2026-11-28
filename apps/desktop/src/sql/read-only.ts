import { dollarTagAt, statementDelimiters } from "./statements";

const writeKeywords = new Set([
  "alter",
  "analyze",
  "call",
  "comment",
  "copy",
  "create",
  "delete",
  "do",
  "drop",
  "exec",
  "execute",
  "grant",
  "insert",
  "into",
  "load",
  "merge",
  "nextval",
  "refresh",
  "reindex",
  "rename",
  "replace",
  "revoke",
  "set_config",
  "setval",
  "truncate",
  "update",
  "upsert",
  "vacuum",
]);

const readStatements = new Set([
  "select",
  "with",
  "values",
  "show",
  "describe",
  "desc",
  "explain",
  "rollback",
]);

// A SELECT can call a user-defined routine with side effects. For protected
// profiles only, review calls whose behavior cannot be inferred from the SQL.
// Include SQL clauses that can introduce a parenthesized expression.
const readCalls = new Set([
  "abs",
  "all",
  "and",
  "any",
  "as",
  "avg",
  "by",
  "case",
  "cast",
  "ceil",
  "ceiling",
  "char_length",
  "coalesce",
  "concat",
  "count",
  "current_date",
  "current_time",
  "current_timestamp",
  "date",
  "date_trunc",
  "dense_rank",
  "distinct",
  "else",
  "except",
  "exists",
  "extract",
  "filter",
  "floor",
  "from",
  "group",
  "group_concat",
  "having",
  "in",
  "intersect",
  "join",
  "lag",
  "lateral",
  "lead",
  "left",
  "length",
  "lower",
  "max",
  "min",
  "not",
  "now",
  "nullif",
  "octet_length",
  "on",
  "or",
  "order",
  "over",
  "partition",
  "rank",
  "right",
  "round",
  "row",
  "row_number",
  "select",
  "some",
  "string_agg",
  "substr",
  "substring",
  "sum",
  "then",
  "trim",
  "union",
  "upper",
  "using",
  "values",
  "when",
  "where",
  "with",
]);

export function sqlMayWrite(sql: string) {
  return splitSqlStatements(sql).some((statement) =>
    sqlWordTokens(statement).some((token) => writeKeywords.has(token)),
  );
}

// The opt-in review treats vendor-specific commands as potentially mutating.
// CTEs and SELECT INTO can write even when the first word looks read-only.
export function sqlNeedsWriteReview(sql: string): boolean {
  return splitSqlStatements(sql).some((statement) => {
    const words = sqlWordTokens(statement, true);
    if (words.length === 0) return false;
    return (
      !readStatements.has(words[0]) ||
      words.some((word) => writeKeywords.has(word))
    );
  });
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let start = 0;
  for (const delimiter of statementDelimiters(sql)) {
    const statement = sql.slice(start, delimiter).trim();
    if (statement) {
      statements.push(statement);
    }
    start = delimiter + 1;
  }
  const tail = sql.slice(start).trim();
  if (tail) {
    statements.push(tail);
  }
  return statements;
}

function sqlWordTokens(sql: string, reviewCalls = false) {
  const tokens: string[] = [];
  // Comments can separate a routine name from its arguments.
  let possibleRoutine = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (/\s/.test(char)) continue;
    if (char === "-" && next === "-") {
      index = skipLineComment(sql, index + 2);
      continue;
    }
    if (char === "/" && next === "*") {
      // MySQL/MariaDB execute the contents of versioned comments.
      if (sql[index + 2] === "!" || sql.startsWith("M!", index + 2))
        tokens.push("execute");
      index = skipBlockComment(sql, index + 2);
      continue;
    }
    if (possibleRoutine && char === "(") tokens.push("execute");
    possibleRoutine = false;
    if (char === "'" || char === '"' || char === "`") {
      index = skipQuoted(sql, index + 1, char);
      possibleRoutine = reviewCalls && char !== "'";
      continue;
    }
    if (char === "$") {
      const tag = dollarTagAt(sql, index);
      if (tag) {
        index = skipDollarQuoted(sql, index + tag.length, tag);
        continue;
      }
    }
    if (isIdentifierStart(char)) {
      const start = index;
      while (isIdentifierPart(sql[index + 1])) {
        index += 1;
      }
      const word = sql.slice(start, index + 1).toLowerCase();
      tokens.push(word);
      possibleRoutine = reviewCalls && !readCalls.has(word);
    }
  }
  return tokens;
}

function skipLineComment(sql: string, index: number) {
  const newline = sql.indexOf("\n", index);
  return newline === -1 ? sql.length : newline;
}

function skipBlockComment(sql: string, index: number) {
  const end = sql.indexOf("*/", index);
  return end === -1 ? sql.length : end + 1;
}

function skipQuoted(sql: string, index: number, quote: string) {
  for (; index < sql.length; index += 1) {
    if (sql[index] === "\\" && quote === "'" && sql[index + 1] !== undefined) {
      index += 1;
    } else if (sql[index] === quote && sql[index + 1] === quote) {
      index += 1;
    } else if (sql[index] === quote) {
      return index;
    }
  }
  return sql.length;
}

function skipDollarQuoted(sql: string, index: number, tag: string) {
  const end = sql.indexOf(tag, index);
  return end === -1 ? sql.length : end + tag.length - 1;
}

function isIdentifierStart(char: string | undefined) {
  return Boolean(char && /[A-Za-z_]/.test(char));
}

function isIdentifierPart(char: string | undefined) {
  return Boolean(char && /[A-Za-z0-9_$]/.test(char));
}
