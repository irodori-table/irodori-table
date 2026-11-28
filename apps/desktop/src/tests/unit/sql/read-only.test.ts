import { describe, expect, it } from "vitest";
import { sqlMayWrite, sqlNeedsWriteReview } from "@/sql/read-only";

describe("sql read-only guard", () => {
  it("allows selects with write-like text in strings and quoted identifiers", () => {
    expect(sqlMayWrite("select 'delete from users' as sql_text")).toBe(false);
    expect(sqlMayWrite('select "update" as quoted_identifier')).toBe(false);
    expect(sqlMayWrite("select $$create table fake$$")).toBe(false);
  });

  it("detects write statements across statement forms", () => {
    expect(
      sqlMayWrite(
        "with changed as (select 1) insert into audit_log select * from changed",
      ),
    ).toBe(true);
    expect(sqlMayWrite("/* maintenance */ vacuum; analyze users")).toBe(true);
    expect(sqlMayWrite("call refresh_rollups()")).toBe(true);
  });

  it("reviews mutations hidden in reads and commands on a protected connection", () => {
    for (const sql of [
      "WITH removed AS (DELETE FROM audit RETURNING id) SELECT * FROM removed",
      "SELECT id INTO archived FROM audit",
      "SELECT nextval('audit_seq')",
      "SELECT billing.post_entry /* audit */ (42)",
      'SELECT "post entry"(42)',
      "/*!40000 DROP TABLE audit */",
      "PRAGMA journal_mode=WAL",
    ]) {
      expect(sqlNeedsWriteReview(sql), sql).toBe(true);
    }
    for (const sql of [
      "SELECT count(*), max(amount) FROM audit WHERE id IN (1, 2)",
      "WITH active AS (SELECT id FROM audit) SELECT * FROM active",
      "SELECT 'delete from audit' AS sample",
      "ROLLBACK",
    ]) {
      expect(sqlNeedsWriteReview(sql), sql).toBe(false);
    }
  });
});
