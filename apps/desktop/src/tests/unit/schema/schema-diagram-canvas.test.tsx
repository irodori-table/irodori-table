import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DatabaseMetadata,
  DbObjectMetadata,
} from "@/generated/irodori-api";
import {
  SchemaDiagramDialog,
  diagramFromMetadata,
  useSchemaDiagramStore,
} from "@/features/schema-diagram";
import { usePreferencesStore } from "@/features/preferences";
import { componentRenderer } from "@/tests/helpers/render";

function table(
  schema: string,
  name: string,
  columns: Array<[string, string]>,
  foreignKeys: DbObjectMetadata["foreignKeys"] = [],
): DbObjectMetadata {
  return {
    schema,
    name,
    kind: "table",
    columns: columns.map(([column, dataType], index) => ({
      name: column,
      dataType,
      nullable: column !== "id",
      ordinal: index + 1,
    })),
    indexes: [],
    primaryKey: ["id"],
    foreignKeys,
  };
}

const metadata: DatabaseMetadata = {
  schemas: [
    {
      name: "sales",
      objects: [
        table("sales", "customers", [
          ["id", "INTEGER"],
          ["name", "TEXT"],
        ]),
        table(
          "sales",
          "orders",
          [
            ["id", "INTEGER"],
            ["customer_id", "INTEGER"],
          ],
          [
            {
              columns: ["customer_id"],
              referencesSchema: "sales",
              referencesTable: "customers",
              referencesColumns: ["id"],
            },
          ],
        ),
      ],
    },
  ],
};

const renderDialog = componentRenderer(SchemaDiagramDialog, () => ({
  onClose: vi.fn(),
  onPutSqlInEditor: vi.fn(),
  onCopySql: vi.fn(),
  onSeedFromDb: vi.fn(),
  canSeedFromDb: true,
}));

/** Every table card's name field, queried by its accessible name. */
function tableNames(): string[] {
  return screen
    .getAllByRole("textbox", { name: "Table name" })
    .map((input) => (input as HTMLInputElement).value);
}

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
  useSchemaDiagramStore.setState({
    open: true,
    document: diagramFromMetadata(metadata),
    selectedTableId: null,
  });
});

describe("SchemaDiagramDialog interactions", () => {
  it("renders the seeded diagram, adds tables, and emits CREATE SQL", async () => {
    const { user, props } = renderDialog();

    expect(tableNames()).toEqual(
      expect.arrayContaining(["customers", "orders"]),
    );

    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(tableNames()).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Create DB SQL" }));

    expect(props.onPutSqlInEditor).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onPutSqlInEditor).mock.calls[0][0]).toContain(
      "CREATE TABLE",
    );
  });

  // #133 wired this dialog into i18n; pin that the toolbar actually follows the
  // locale, since the queries above depend on the accessible names.
  it("labels its toolbar in the active locale", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderDialog();

    expect(
      screen.getByRole("button", { name: "DB 作成 SQL" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create DB SQL" }),
    ).not.toBeInTheDocument();
  });
});
