import {
  LocalizedError,
  isRecord,
  keyMessage,
  type LocalizedMessage,
} from "@/core";
import type { DbEngine, DbObjectMetadata } from "@/generated/irodori-api";
import {
  qualifiedObjectName,
  quoteSqlIdentifier,
} from "@/features/workbench/object-sql";
import { DelimitedReader, delimitedFileRows } from "./delimited";

export type ImportTextFormat = "csv" | "tsv" | "json" | "jsonl";
export type ImportFileKind = ImportTextFormat | "sql" | "excel";

export type ParsedImport = {
  columns: string[];
  rows: unknown[][];
  totalRows: number;
  truncated: boolean;
};

const importFileKindByExtension = [
  { kind: "csv", extensions: [".csv"] },
  { kind: "tsv", extensions: [".tsv", ".tab"] },
  { kind: "json", extensions: [".json"] },
  { kind: "jsonl", extensions: [".jsonl", ".ndjson"] },
  { kind: "sql", extensions: [".sql"] },
  { kind: "excel", extensions: [".xls", ".xlsx"] },
] as const satisfies ReadonlyArray<{
  kind: ImportFileKind;
  extensions: readonly string[];
}>;

export function detectImportFileKind(fileName: string): ImportFileKind | null {
  const lower = fileName.toLowerCase();
  return (
    importFileKindByExtension.find(({ extensions }) =>
      extensions.some((extension) => lower.endsWith(extension)),
    )?.kind ?? null
  );
}

export function inferImportTableName(fileName: string): string {
  const base = fileName
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "");
  return sanitizeSqlName(base || "imported_rows");
}

export function parseImportText(
  text: string,
  format: ImportTextFormat | "ndjson" | string,
  maxRows = 10000,
): ParsedImport {
  const normalizedFormat = normalizeImportTextFormat(format);
  if (!normalizedFormat) {
    throw new LocalizedError(unsupportedImportFormatMessage(format));
  }
  return importTextParsers[normalizedFormat](text, maxRows);
}

type ImportTextParser = (text: string, maxRows: number) => ParsedImport;

const importTextParsers: Record<ImportTextFormat, ImportTextParser> = {
  csv: (text, maxRows) => parseDelimitedImport(text, ",", maxRows),
  tsv: (text, maxRows) => parseDelimitedImport(text, "\t", maxRows),
  json: parseJsonImport,
  jsonl: parseJsonLinesImport,
};

const supportedImportTextFormats = new Set<string>([
  "csv",
  "tsv",
  "json",
  "jsonl",
]);

const supportedImportFormatList = "CSV, TSV, JSON, JSONL/NDJSON";

/**
 * Describe why a file cannot be imported, as a key the caller resolves (#135).
 * The format string is the user's own filename extension, so it is interpolated
 * rather than translated.
 */
export function unsupportedImportFormatMessage(
  format: string,
): LocalizedMessage {
  const normalized = normalizeFormatName(format);
  switch (normalized) {
    case "sql":
      return keyMessage("import.error.sqlNotTableData");
    case "excel":
    case "xls":
    case "xlsx":
      return keyMessage("import.error.xlsxUnsupported", {
        supported: supportedImportFormatList,
      });
    default:
      return keyMessage("import.error.unsupportedFormat", {
        format,
        supported: supportedImportFormatList,
      });
  }
}

export function generateImportSql(
  tableName: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  includeCreate = true,
): string {
  const plan = buildImportPlan({
    tableName,
    columns,
    rows,
    includeCreate,
    engine: "sqlite",
  });
  return generatePreviewSql(plan, rows);
}

export type ImportMapping = {
  connectionId: string;
  schema: string;
  table: string;
  // null requires a choice; the empty string explicitly skips a source field.
  choices: (string | null)[];
};

export function matchImportColumns(
  source: readonly string[],
  target: DbObjectMetadata,
): (string | null)[] {
  const normalized = source.map((header) => header.toLowerCase());
  const unique = new Map<string, string | null>();
  for (const { name } of target.columns) {
    const key = name.toLowerCase();
    unique.set(key, unique.has(key) ? null : name);
  }
  const seen = new Set<string>();
  for (const key of normalized) {
    if (seen.has(key)) unique.delete(key);
    seen.add(key);
  }
  return normalized.map((key) => unique.get(key) ?? null);
}

export function importMappingError(
  mapping: ImportMapping,
  table: DbObjectMetadata | undefined,
) {
  if (!table) return "import.mapping.unavailable" as const;
  const selected = mapping.choices.filter((name): name is string =>
    Boolean(name),
  );
  if (selected.length !== new Set(selected).size)
    return "import.mapping.duplicate" as const;
  const available = new Set(table.columns.map((c) => c.name));
  if (
    mapping.choices.includes(null) ||
    selected.some((name) => !available.has(name))
  ) {
    return "import.mapping.unresolved" as const;
  }
  return selected.length ? null : ("import.mapping.empty" as const);
}

export type ImportPlan = ReturnType<typeof buildImportPlan>;

export function buildImportPlan(options: {
  tableName: string;
  columns: readonly string[];
  rows: readonly (readonly unknown[])[];
  engine: DbEngine;
  includeCreate: boolean;
  columnTypes?: readonly string[];
  mapped?: { table: DbObjectMetadata; choices: (string | null)[] };
}) {
  const { engine, columns, mapped, includeCreate, columnTypes, rows } = options;
  const table = mapped
    ? qualifiedObjectName(engine, mapped.table)
    : quoteSqlIdentifier(engine, sanitizeSqlName(options.tableName));
  const names = mapped ? mapped.choices : normalizeColumns(columns);
  const fields = names.flatMap((name, index) =>
    name
      ? [
          {
            index,
            sqlName: quoteSqlIdentifier(engine, name),
            type: includeCreate
              ? (columnTypes?.[index] ??
                inferSqlType(rows.map((row) => row[index])))
              : "",
          },
        ]
      : [],
  );
  return { table, fields, includeCreate, engine };
}

export function generatePreviewSql(
  plan: ImportPlan,
  rows: readonly (readonly unknown[])[],
) {
  return (
    [
      plan.includeCreate ? createImportTableStatement(plan) : null,
      rows.length ? insertImportRowsStatement(plan, rows) : null,
    ]
      .filter(isPresent)
      .join("\n\n") + "\n"
  );
}

export function sanitizeSqlName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safe = cleaned || "imported_rows";
  return /^[A-Za-z_]/.test(safe) ? safe : `_${safe}`;
}

function parseDelimitedImport(
  text: string,
  delimiter: string,
  maxRows: number,
): ParsedImport {
  const reader = new DelimitedReader(delimiter);
  const preview = new DelimitedPreview(maxRows);
  for (const row of reader.read(text)) preview.add(row);
  for (const row of reader.finish()) preview.add(row);
  const { columns, rows, totalRows, truncated } = preview.result();
  return { columns, rows, totalRows, truncated };
}

class DelimitedPreview {
  private header?: string[];
  private rows: string[][] = [];
  private total = 0;
  private width = 0;
  private types: (string | undefined)[] = [];

  constructor(private readonly limit: number) {}

  add(row: string[]) {
    if (!this.header) {
      this.header = row;
      this.width = row.length;
      return;
    }
    if (!row.some((cell) => cell !== "")) return;
    this.total++;
    this.width = Math.max(this.width, row.length);
    row.forEach((value, index) => {
      if (value === "" || this.types[index] === "TEXT") return;
      const type =
        sqlTypeChecks.find(({ matches }) => matches(value))?.type ?? "TEXT";
      const prior = this.types[index];
      this.types[index] =
        !prior || prior === type
          ? type
          : (prior === "INTEGER" && type === "REAL") ||
              (prior === "REAL" && type === "INTEGER")
            ? "REAL"
            : "TEXT";
    });
    if (this.rows.length < this.limit) this.rows.push(row);
  }

  result() {
    const columns = delimitedColumns(
      padDelimitedRow(this.header ?? [], this.width),
    );
    return {
      columns,
      rows: this.rows.map((row) => padDelimitedRow(row, this.width)),
      totalRows: this.total,
      truncated: this.total > this.rows.length,
      columnTypes: columns.map((_, index) => this.types[index] ?? "TEXT"),
    };
  }
}

export async function previewDelimitedFile(
  file: Blob,
  format: "csv" | "tsv",
  signal?: AbortSignal,
) {
  const preview = new DelimitedPreview(100);
  for await (const row of delimitedFileRows(
    file,
    format === "csv" ? "," : "\t",
    signal,
  )) {
    preview.add(row);
  }
  return preview.result();
}

export async function writeCompleteImport(
  file: Blob,
  format: "csv" | "tsv",
  plan: ImportPlan,
  expectedRows: number,
  write: (text: string) => Promise<void>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (plan.includeCreate)
    await write(createImportTableStatement(plan) + "\n\n");
  const tuples: string[] = [];
  let chars = 0;
  let count = 0;
  let header = true;
  async function flush() {
    if (!tuples.length) return;
    signal.throwIfAborted();
    await write(insertValues(plan, tuples) + "\n");
    tuples.length = 0;
    chars = 0;
  }
  for await (const row of delimitedFileRows(
    file,
    format === "csv" ? "," : "\t",
    signal,
  )) {
    if (header) {
      header = false;
      continue;
    }
    if (!row.some((value) => value !== "")) continue;
    const tuple = importRowSql(plan, row);
    tuples.push(tuple);
    chars += tuple.length;
    count++;
    if (tuples.length >= 250 || chars >= 128 * 1024) await flush();
  }
  await flush();
  signal.throwIfAborted();
  if (count !== expectedRows)
    throw new LocalizedError(keyMessage("import.error.sourceChanged"));
}

function parseJsonImport(text: string, maxRows: number): ParsedImport {
  return rowsFromJsonValues(extractJsonRows(parseJsonValue(text)), maxRows);
}

function parseJsonLinesImport(text: string, maxRows: number): ParsedImport {
  return rowsFromJsonValues(jsonLines(text).map(parseJsonValue), maxRows);
}

function extractJsonRows(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [value];
  }
  return firstJsonArrayProperty(value, ["rows", "data"]) ?? [value];
}

function rowsFromJsonValues(
  values: readonly unknown[],
  maxRows: number,
): ParsedImport {
  const columns = columnsFromJsonValues(values);
  return parsedImport(
    columns,
    values.map((value) => valueToRow(value, columns)),
    maxRows,
  );
}

function columnsFromJsonValues(values: readonly unknown[]): string[] {
  const recordColumns = unique(values.flatMap(recordKeys));
  if (recordColumns.length > 0) {
    return recordColumns;
  }
  const maxArrayLength = maxJsonArrayLength(values);
  if (maxArrayLength > 0) {
    return Array.from(
      { length: maxArrayLength },
      (_, index) => `column_${index + 1}`,
    );
  }
  return ["value"];
}

function maxJsonArrayLength(values: readonly unknown[]): number {
  return values.reduce<number>(
    (maxLength, value) =>
      Array.isArray(value) ? Math.max(maxLength, value.length) : maxLength,
    0,
  );
}

function valueToRow(value: unknown, columns: readonly string[]): unknown[] {
  if (isRecord(value)) {
    return columns.map((column) => value[column] ?? null);
  }
  if (Array.isArray(value)) {
    return columns.map((_, index) => value[index] ?? null);
  }
  return [value];
}

function normalizeColumns(columns: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return columns.map((column, index) => {
    const base = sanitizeSqlName(String(column || `column_${index + 1}`));
    return nextUniqueName(base, counts);
  });
}

function inferSqlType(values: readonly unknown[]): string {
  const present = values.filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  if (present.length === 0) {
    return "TEXT";
  }
  return (
    sqlTypeChecks.find(({ matches }) => present.every(matches))?.type ?? "TEXT"
  );
}

function createImportTableStatement(plan: ImportPlan): string {
  const definitions = plan.fields
    .map(({ sqlName, type }) => `  ${sqlName} ${type}`)
    .join(",\n");
  return `CREATE TABLE IF NOT EXISTS ${plan.table} (\n${definitions}\n);`;
}

function insertImportRowsStatement(
  plan: ImportPlan,
  rows: readonly (readonly unknown[])[],
) {
  return insertValues(
    plan,
    rows.map((row) => importRowSql(plan, row)),
  );
}

function insertValues(plan: ImportPlan, tuples: string[]) {
  const names = plan.fields.map(({ sqlName }) => sqlName).join(", ");
  return `INSERT INTO ${plan.table} (${names}) VALUES\n${tuples.join(",\n")};`;
}

function importRowSql(plan: ImportPlan, row: readonly unknown[]) {
  return `  (${plan.fields.map(({ index }) => sqlLiteral(row[index] ?? null, plan.engine)).join(", ")})`;
}

function parsedImport(
  columns: string[],
  allRows: unknown[][],
  maxRows: number,
): ParsedImport {
  const rows = allRows.slice(0, maxRows);
  return {
    columns,
    rows,
    totalRows: allRows.length,
    truncated: allRows.length > rows.length,
  };
}

function normalizeImportTextFormat(format: string): ImportTextFormat | null {
  const normalized = normalizeFormatName(format);
  if (normalized === "ndjson") {
    return "jsonl";
  }
  return supportedImportTextFormats.has(normalized)
    ? (normalized as ImportTextFormat)
    : null;
}

function normalizeFormatName(format: string): string {
  return format.trim().toLowerCase().replace(/^\./, "");
}

function padDelimitedRow(
  row: readonly string[],
  columnCount: number,
): string[] {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
}

function delimitedColumns(columns: string[]) {
  return columns.map((column, index) => column || `column_${index + 1}`);
}

function parseJsonValue(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function jsonLines(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
}

function firstJsonArrayProperty(
  value: Record<string, unknown>,
  keys: readonly string[],
): unknown[] | null {
  return keys.map((key) => value[key]).find(Array.isArray) ?? null;
}

function recordKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function nextUniqueName(base: string, counts: Map<string, number>) {
  const key = base.toLowerCase();
  const count = counts.get(key) ?? 0;
  counts.set(key, count + 1);
  return count === 0 ? base : `${base}_${count + 1}`;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

const sqlTypeChecks = [
  { type: "BOOLEAN", matches: isBooleanLike },
  { type: "INTEGER", matches: isIntegerLike },
  { type: "REAL", matches: isNumberLike },
] as const;

function isBooleanLike(value: unknown) {
  if (typeof value === "boolean") {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return /^(true|false)$/i.test(value.trim());
}

function isIntegerLike(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value);
  }
  if (typeof value === "bigint") {
    return true;
  }
  return (
    typeof value === "string" &&
    /^-?\d+$/.test(value.trim()) &&
    !isZeroPaddedNumeric(value.trim())
  );
}

function isNumberLike(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "bigint") {
    return true;
  }
  return (
    typeof value === "string" &&
    /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) &&
    !isZeroPaddedNumeric(value.trim())
  );
}

/**
 * `01234` is a code (zip, phone, account number), not a number. Typing its
 * column INTEGER/REAL would make the engine coerce the quoted literal and
 * destroy the leading zero, so zero-padded digit strings must stay TEXT.
 * A decimal point exempts the value: `0.5` and friends are ordinary numbers.
 */
function isZeroPaddedNumeric(text: string) {
  return /^-?0\d/.test(text) && !text.includes(".");
}

function sqlLiteral(value: unknown, engine: DbEngine): string {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  const text =
    typeof value === "object"
      ? JSON.stringify(jsonSafeValue(value))
      : String(value);
  if (
    ["mysql", "mariadb", "tidb"].includes(engine) &&
    (text.includes("\\") || text.includes("\0"))
  ) {
    // Hex string conversion works with either MySQL backslash-escape mode.
    const hex = Array.from(new TextEncoder().encode(text), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `CONVERT(X'${hex}' USING utf8mb4)`;
  }
  return `'${text.replace(/'/g, "''")}'`;
}

function jsonSafeValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(jsonSafeValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        jsonSafeValue(nested),
      ]),
    );
  }
  return value;
}
