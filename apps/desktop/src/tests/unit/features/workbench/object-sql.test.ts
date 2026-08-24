import { describe, expect, it } from "vitest";
import {
  objectKindLabel,
  qualifiedObjectName,
  tablePreviewSql,
} from "@/features/workbench/object-sql";
import type { DbObjectMetadata } from "@/generated/irodori-api";

function object(partial: Partial<DbObjectMetadata>): DbObjectMetadata {
  return {
    schema: "public",
    name: "customers",
    kind: "table",
    columns: [],
    indexes: [],
    primaryKey: [],
    foreignKeys: [],
    ...partial,
  };
}

describe("workbench object SQL helpers", () => {
  it("quotes object names for the active engine", () => {
    expect(qualifiedObjectName("postgres", object({}))).toBe(
      '"public"."customers"',
    );
    expect(qualifiedObjectName("mysql", object({ schema: "sales" }))).toBe(
      "`sales`.`customers`",
    );
  });

  it("builds engine-specific preview SQL", () => {
    expect(tablePreviewSql("postgres", object({}))).toBe(
      'select * from "public"."customers" limit 200;',
    );
    expect(tablePreviewSql("sqlserver", object({ schema: "dbo" }))).toBe(
      'select top (200) * from "dbo"."customers";',
    );
  });

  /**
   * Each expectation here was run against a live server before it was written
   * down. The DynamoDB one is the statement double-clicking a table used to
   * produce, and it failed twice over: the schema a connector reports for a
   * non-SQL store labels the tree — the region, `db0`, `default` — and cannot
   * be named in a statement, and PartiQL has no LIMIT clause at all.
   */
  it("previews a DynamoDB table without the region or a limit clause", () => {
    expect(
      tablePreviewSql(
        "dynamodb",
        object({ schema: "us-east-1", name: "bookchecker-app" }),
      ),
    ).toBe('select * from "bookchecker-app";');
  });

  it("previews an ArangoDB collection in AQL", () => {
    expect(
      tablePreviewSql(
        "arangodb",
        object({ schema: "_system", name: "verify" }),
      ),
    ).toBe("FOR doc IN verify LIMIT 200 RETURN doc");
  });

  it("previews a Qdrant collection by naming it", () => {
    expect(
      tablePreviewSql("qdrant", object({ schema: "default", name: "verify" })),
    ).toBe("verify");
  });

  it("previews a Redis key with the command its type answers", () => {
    const key = (dataType: string) =>
      object({
        schema: "db0",
        name: "verify:key",
        columns: [{ name: "value", dataType, nullable: true, ordinal: 1 }],
      });

    expect(tablePreviewSql("redis", key("string"))).toBe("GET verify:key");
    expect(tablePreviewSql("redis", key("list"))).toBe(
      "LRANGE verify:key 0 199",
    );
    expect(tablePreviewSql("redis", key("hash"))).toBe("HGETALL verify:key");
    expect(tablePreviewSql("redis", key("set"))).toBe("SMEMBERS verify:key");
    expect(tablePreviewSql("redis", key("zset"))).toBe(
      "ZRANGE verify:key 0 199 WITHSCORES",
    );
    // A key whose type the connector did not report still gets a command
    // rather than a statement no Redis server would accept.
    expect(tablePreviewSql("redis", object({ name: "verify:key" }))).toBe(
      "GET verify:key",
    );
  });

  it("formats object kind labels", () => {
    expect(objectKindLabel(object({ kind: "view" }))).toBe("view");
    expect(objectKindLabel(object({ kind: "procedure" }))).toBe("procedure");
  });
});
