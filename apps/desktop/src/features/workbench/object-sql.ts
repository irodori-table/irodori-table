import type { DbEngine, DbObjectMetadata } from "@/generated/irodori-api";

export function objectKindLabel(object: DbObjectMetadata) {
  switch (object.kind) {
    case "view":
      return "view";
    case "function":
      return "function";
    case "procedure":
      return "procedure";
    case "index":
      return "index";
    default:
      return "table";
  }
}

export function quoteSqlIdentifier(engine: DbEngine, name: string) {
  const quote =
    engine === "mysql" || engine === "mariadb" || engine === "tidb" ? "`" : '"';
  return `${quote}${name.split(quote).join(quote + quote)}${quote}`;
}

export function qualifiedObjectName(
  engine: DbEngine,
  object: DbObjectMetadata,
) {
  const parts = [object.schema, object.name].filter(Boolean);
  return parts.map((part) => quoteSqlIdentifier(engine, part)).join(".");
}

const PREVIEW_ROWS = 200;

export const tableFilterOperators = [
  "=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "IS NULL",
  "IS NOT NULL",
] as const;
export type TableBrowse = {
  column: string;
  operator: (typeof tableFilterOperators)[number];
  value: string;
  sortColumn: string;
  direction: "asc" | "desc";
};
export const unfilteredTable: TableBrowse = {
  column: "",
  operator: "=",
  value: "",
  sortColumn: "",
  direction: "asc",
};

export function supportsTableBrowse(engine: DbEngine) {
  return (
    engine === "sqlite" ||
    engine === "postgres" ||
    engine === "mysql" ||
    engine === "mariadb"
  );
}

export function tableBrowseKey(connection: string, object: DbObjectMetadata) {
  return JSON.stringify([connection, object.schema, object.name]);
}

function previewValueSql(engine: DbEngine, value: string): string {
  const quoted = "'" + value.replace(/'/g, "''") + "'";
  if (engine === "mysql" || engine === "mariadb") {
    // Hex avoids the session-dependent interpretation of backslashes in MySQL.
    const hex = Array.from(new TextEncoder().encode(value), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return "CONVERT(X'" + hex + "' USING utf8mb4)";
  }
  // E strings have the same meaning under both PostgreSQL string modes.
  return engine === "postgres" ? "E" + quoted.replace(/\\/g, "\\\\") : quoted;
}

/**
 * Preview an object's contents in the language its connector actually speaks.
 *
 * A `select … limit` over a schema-qualified name is right for a SQL engine and
 * wrong for most of the rest, and the wrongness was invisible: the schema a
 * non-SQL connector reports is a label for the tree (DynamoDB's region, Redis's
 * `db0`), not a namespace any statement may name. Double-clicking a DynamoDB
 * table produced `select * from "us-east-1"."bookchecker-app" limit 200;` —
 * where the region is not addressable and PartiQL has no LIMIT clause (the row
 * cap rides the request instead), so both halves of the statement were
 * rejected before the first row was read.
 *
 * Each branch below is measured against a live server, not inferred.
 */
/**
 * Whether `sql` is still the untouched preview of `object`, the SQL its table
 * tab opens with. Whitespace and trailing semicolons do not count as edits.
 */
export function isTablePreviewSql(
  engine: DbEngine,
  object: DbObjectMetadata,
  sql: string,
): boolean {
  const normalize = (text: string) =>
    text
      .trim()
      .replace(/;+$/, "")
      .replace(
        /("(?:[^"]|"")*"|`(?:[^`]|``)*`|'(?:[^']|'')*')|\s+/g,
        (match, quoted: string | undefined) =>
          quoted === undefined ? " " : match,
      )
      .trim();
  return normalize(sql) === normalize(tablePreviewSql(engine, object));
}

export function tablePreviewSql(
  engine: DbEngine,
  object: DbObjectMetadata,
  browse?: TableBrowse,
) {
  if (browse && supportsTableBrowse(engine)) {
    const columns = new Set(object.columns.map(({ name }) => name));
    let sql = "select * from " + qualifiedObjectName(engine, object);
    if (
      columns.has(browse.column) &&
      tableFilterOperators.includes(browse.operator)
    ) {
      sql +=
        " where " +
        quoteSqlIdentifier(engine, browse.column) +
        " " +
        browse.operator;
      if (!browse.operator.startsWith("IS "))
        sql += " " + previewValueSql(engine, browse.value);
    }
    if (columns.has(browse.sortColumn)) {
      sql +=
        " order by " +
        quoteSqlIdentifier(engine, browse.sortColumn) +
        (browse.direction === "desc" ? " desc" : " asc");
    }
    return sql + " limit " + PREVIEW_ROWS + ";";
  }
  switch (engine) {
    // PartiQL: the table stands alone and the cap is not part of the statement.
    case "dynamodb":
      return `select * from ${quoteSqlIdentifier(engine, object.name)};`;
    // AQL.
    case "arangodb":
      return `FOR doc IN ${object.name} LIMIT ${PREVIEW_ROWS} RETURN doc`;
    // The connector takes the collection to scroll, not a query over it.
    case "qdrant":
      return object.name;
    // A Redis command, chosen by the key's type — which the connector reports
    // as the single column's data type.
    case "redis":
      return redisPreviewCommand(object);
    case "sqlserver":
      return `select top (${PREVIEW_ROWS}) * from ${qualifiedObjectName(engine, object)};`;
    default:
      return `select * from ${qualifiedObjectName(engine, object)} limit ${PREVIEW_ROWS};`;
  }
}

function redisPreviewCommand(object: DbObjectMetadata) {
  const key = object.name;
  switch (object.columns[0]?.dataType) {
    case "list":
      return `LRANGE ${key} 0 ${PREVIEW_ROWS - 1}`;
    case "hash":
      return `HGETALL ${key}`;
    case "set":
      return `SMEMBERS ${key}`;
    case "zset":
      return `ZRANGE ${key} 0 ${PREVIEW_ROWS - 1} WITHSCORES`;
    case "stream":
      return `XRANGE ${key} - +`;
    default:
      return `GET ${key}`;
  }
}
