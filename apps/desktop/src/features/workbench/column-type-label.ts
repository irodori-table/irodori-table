// The object browser has room for a type's name, not its declaration:
// "timestamp with time zone not null" pushed the column name out of a narrow
// sidebar. The row shows the short name and its tooltip the whole declaration.

// SQL-standard spellings that have a well-known short alias.
const SHORT_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^character varying\b/i, "varchar"],
  [/^character\b/i, "char"],
  [/^bit varying\b/i, "varbit"],
  [/^double precision\b/i, "double"],
];

/**
 * The short name of a column type: "varchar" for "character varying(255)",
 * "timestamp" for "timestamp(3) with time zone". Lengths, precision, time
 * zone qualifiers and enum values are dropped; array brackets stay, since an
 * array of a type is a different type.
 */
export function shortColumnType(dataType: string): string {
  let short = dataType
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+with(out)? (local )?time zone\b/gi, "")
    .trim();
  for (const [pattern, alias] of SHORT_ALIASES) {
    short = short.replace(pattern, alias);
  }
  return short || dataType;
}

/** The full declaration for the tooltip: type, then NOT NULL when it applies. */
export function columnTypeDetail(column: {
  name: string;
  dataType: string;
  nullable: boolean;
}): string {
  return `${column.name}: ${column.dataType}${column.nullable ? "" : " not null"}`;
}
