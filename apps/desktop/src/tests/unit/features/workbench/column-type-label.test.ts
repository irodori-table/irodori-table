import { describe, expect, it } from "vitest";
import {
  columnTypeDetail,
  shortColumnType,
} from "@/features/workbench/column-type-label";

/**
 * The sidebar row shows a column type's short name so the column name keeps
 * the room; the full declaration stays one hover away.
 */

describe("shortColumnType", () => {
  it.each([
    ["character varying", "varchar"],
    ["character varying(255)", "varchar"],
    ["character(10)", "char"],
    ["timestamp with time zone", "timestamp"],
    ["timestamp(3) without time zone", "timestamp"],
    ["time with time zone", "time"],
    ["double precision", "double"],
    ["bit varying(8)", "varbit"],
    ["numeric(10,2)", "numeric"],
    ["character varying(20)[]", "varchar[]"],
    ["enum('draft','sent')", "enum"],
    ["int(11) unsigned", "int unsigned"],
    ["VARCHAR(16777216)", "VARCHAR"],
    ["TIMESTAMP_NTZ(9)", "TIMESTAMP_NTZ"],
    ["TIMESTAMP WITH LOCAL TIME ZONE", "TIMESTAMP"],
  ])("shortens %s to %s", (dataType, expected) => {
    expect(shortColumnType(dataType)).toBe(expected);
  });

  it.each(["uuid", "integer", "text", "jsonb", "USER-DEFINED", "ARRAY"])(
    "leaves %s as it is",
    (dataType) => {
      expect(shortColumnType(dataType)).toBe(dataType);
    },
  );

  it("never shortens a type to nothing", () => {
    expect(shortColumnType("(weird)")).toBe("(weird)");
  });
});

describe("columnTypeDetail", () => {
  it("spells out the full type and NOT NULL", () => {
    expect(
      columnTypeDetail({
        name: "created_at",
        dataType: "timestamp with time zone",
        nullable: false,
      }),
    ).toBe("created_at: timestamp with time zone not null");
  });

  it("leaves NOT NULL off a nullable column", () => {
    expect(
      columnTypeDetail({
        name: "message_id",
        dataType: "uuid",
        nullable: true,
      }),
    ).toBe("message_id: uuid");
  });
});
