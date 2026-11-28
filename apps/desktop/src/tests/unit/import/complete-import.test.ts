import { openSqliteFixture } from "@/tests/helpers/sqlite-fixture";
import { describe, expect, it, vi } from "vitest";
import { DelimitedReader } from "@/features/import/delimited";
import {
  buildImportPlan,
  generatePreviewSql,
  matchImportColumns,
  previewDelimitedFile,
} from "@/features/import/importers";
import { saveImportScript } from "@/features/import/save-import";
import type { DbObjectMetadata } from "@/generated/irodori-api";

const { File: FileWithBlobReads } = await vi.importActual<{
  File: typeof File;
}>("node:buffer");

function csvFile(source: string): File {
  return new FileWithBlobReads([source], "records.csv");
}

const table: DbObjectMetadata = {
  name: "table`name",
  schema: "db`name",
  kind: "table",
  indexes: [],
  primaryKey: [],
  foreignKeys: [],
  columns: ["primary`key", "Name"].map((name, ordinal) => ({
    name,
    ordinal,
    nullable: true,
    dataType: "TEXT",
  })),
};

it("only auto-matches unambiguous headers and uses the selected dialect for mapped names", () => {
  expect(matchImportColumns(["PRIMARY`KEY", "NAME", "name"], table)).toEqual([
    "primary`key",
    null,
    null,
  ]);
  const plan = buildImportPlan({
    tableName: "",
    columns: ["primary", "ignored", "display"],
    rows: [],
    includeCreate: false,
    engine: "mysql",
    mapped: { table, choices: ["primary`key", "", "Name"] },
  });
  expect(generatePreviewSql(plan, [["0007", "unused", "O'Hara"]])).toBe(
    "INSERT INTO `db``name`.`table``name` (`primary``key`, `Name`) VALUES\n  ('0007', 'O''Hara');\n",
  );
});

describe("full-file import SQL", () => {
  it("imports all 10,001 keys and keeps fields split across reads, late padded identifiers and defaults", async () => {
    const header = "id,note,code\r\n";
    const prefix = '1,"';
    const padding = "x".repeat(65_535 - header.length - prefix.length);
    const note = padding + '\r\n雪 "quoted"';
    const rows = Array.from({ length: 10_000 }, (_, n) => {
      const id = n + 2;
      return `${id},note,${id === 10_001 ? "0007" : String(id)}`;
    });
    const file = csvFile(
      header +
        prefix +
        padding +
        '\r\n雪 ""quoted""",1\r\n' +
        rows.join("\r\n"),
    );
    const preview = await previewDelimitedFile(file, "csv");
    expect(preview.rows).toHaveLength(100);
    expect(preview.totalRows).toBe(10_001);
    expect(preview.truncated).toBe(true);
    expect(preview.columnTypes).toEqual(["INTEGER", "TEXT", "TEXT"]);
    const database = await openSqliteFixture();
    try {
      const plan = buildImportPlan({
        ...preview,
        tableName: "records",
        engine: "sqlite",
        includeCreate: true,
      });
      const output = {
        write: vi.fn(async (sql: string) => {
          database.exec(sql);
        }),
        close: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
      };
      const saved = await saveImportScript(
        file,
        "csv",
        plan,
        preview.totalRows,
        new AbortController().signal,
        async () => output,
      );
      expect(saved).toBe(true);
      expect(output.write.mock.calls.length).toBeGreaterThan(40);
      expect(output.close).toHaveBeenCalledOnce();
      expect(output.abort).not.toHaveBeenCalled();
      expect(
        database
          .prepare(
            "SELECT count(*) AS count, count(DISTINCT id) AS distinctKeys, min(id) AS first, max(id) AS last FROM records",
          )
          .get(),
      ).toEqual({
        count: 10_001,
        distinctKeys: 10_001,
        first: 1,
        last: 10_001,
      });
      expect(
        database.prepare("SELECT note FROM records WHERE id=1").get(),
      ).toEqual({ note });
      expect(
        database.prepare("SELECT code FROM records WHERE id=10001").get(),
      ).toEqual({
        code: "0007",
      });
      database.exec(
        "CREATE TABLE dest (code TEXT, other TEXT DEFAULT 'default')",
      );
      const mapped = buildImportPlan({
        ...preview,
        tableName: "dest",
        engine: "sqlite",
        includeCreate: false,
        mapped: {
          table: { ...table, schema: "main", name: "dest" },
          choices: ["", "", "code"],
        },
      });
      await saveImportScript(
        file,
        "csv",
        mapped,
        preview.totalRows,
        new AbortController().signal,
        async () => output,
      );
      expect(
        database
          .prepare("SELECT count(*) AS count FROM dest WHERE other='default'")
          .get(),
      ).toEqual({ count: 10_001 });
    } finally {
      database.close();
    }
  });

  it("handles quotes and CRLF on every possible boundary", () => {
    const reader = new DelimitedReader(",");
    const rows = Array.from('a,b\r\n1,"a""b\r\nc"\r\n2,x\r3,z').flatMap((c) => [
      ...reader.read(c),
    ]);
    rows.push(...reader.finish());
    expect(rows).toEqual([
      ["a", "b"],
      ["1", 'a"b\r\nc'],
      ["2", "x"],
      ["3", "z"],
    ]);
  });

  it.each(["cancel", "write", "source"] as const)(
    "discards staged SQL on %s failure",
    async (failure) => {
      const file = csvFile("id\n1\n");
      const preview = await previewDelimitedFile(file, "csv");
      const control = new AbortController();
      const abort = vi.fn(async () => {});
      const close = vi.fn(async () => {});
      const write = vi.fn(async () => {
        if (failure === "cancel") control.abort();
        if (failure === "write") throw Error("disk full");
      });
      const plan = buildImportPlan({
        ...preview,
        tableName: "records",
        engine: "sqlite",
        includeCreate: true,
      });
      await expect(
        saveImportScript(
          file,
          "csv",
          plan,
          failure === "source" ? 2 : 1,
          control.signal,
          async () => ({ write, close, abort }),
        ),
      ).rejects.toThrow();
      expect(abort).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
    },
  );
});
