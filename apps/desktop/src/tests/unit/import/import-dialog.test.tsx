import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import {
  ImportDialog,
  type ImportPreview,
} from "@/features/import/ImportDialog";
import { usePreferencesStore } from "@/features/preferences";
import { openSqliteFixture } from "@/tests/helpers/sqlite-fixture";
import type { DbObjectMetadata } from "@/generated/irodori-api";
import { componentRenderer } from "@/tests/helpers/render";

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    columns: ["id", "name"],
    rows: [
      [1, "Ada"],
      [2, "Grace"],
    ],
    totalRows: 2,
    truncated: false,
    fileName: "people.csv",
    format: "csv",
    tableName: "people",
    mode: "create",
    ...overrides,
  };
}

const renderDialog = componentRenderer(ImportDialog, () => ({
  preview: preview(),
  engine: "sqlite" as const,
  connectionId: "active",
  onPreviewChange: vi.fn(),
  onClose: vi.fn(),
  onPutSqlInEditor: vi.fn(),
  formatCell: (value: unknown) => String(value),
  formatCount: (value: bigint | number) => String(value),
}));

function applyUpdater(
  updater: SetStateAction<ImportPreview | null>,
  current: ImportPreview,
): ImportPreview | null {
  return typeof updater === "function" ? updater(current) : updater;
}

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

it("shows separate sample and full-file actions for a capped import", () => {
  renderDialog({
    preview: preview({
      truncated: true,
      totalRows: 10_001,
      sourceFile: new File(["id\n1\n"], "people.csv"),
    }),
  });
  expect(
    screen.getByRole("button", { name: "Copy preview SQL" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Put preview SQL in editor" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Save SQL for all 10001 rows" }),
  ).toBeEnabled();
});

describe("ImportDialog append mode (#164)", () => {
  it.each(["csv", "tsv"] as const)(
    "maps %s fields, skips extras and preserves padded keys and database defaults",
    async (format) => {
      const table: DbObjectMetadata = {
        kind: "table",
        name: "target customers",
        schema: "main",
        indexes: [],
        primaryKey: [],
        foreignKeys: [],
        columns: ["customer_id", "display name", "region"].map(
          (name, index) => ({
            name,
            ordinal: index,
            nullable: true,
            dataType: "TEXT",
          }),
        ),
      };
      const database = await openSqliteFixture();
      try {
        database.exec(
          'CREATE TABLE "target customers" (customer_id TEXT PRIMARY KEY, "display name" TEXT, region TEXT DEFAULT \'east\')',
        );
        const { user, props } = renderDialog({
          preview: preview({
            mode: "append",
            format,
            columns: ["customer code", "customer name", "extra"],
            rows: [["0007", "O'Hara", "unused"]],
            totalRows: 1,
          }),
          metadata: { schemas: [{ name: "main", objects: [table] }] },
        });
        await user.selectOptions(
          screen.getByRole("combobox", { name: "Destination table" }),
          "0",
        );
        const put = screen.getByRole("button", { name: "Put SQL in editor" });
        expect(put).toBeDisabled();
        expect(
          screen.getByText(
            "Choose a destination or skip each unmatched field.",
          ),
        ).toBeVisible();
        const code = screen.getByRole("combobox", {
          name: "Destination for customer code",
        });
        const display = screen.getByRole("combobox", {
          name: "Destination for customer name",
        });
        expect(display).toHaveValue("choose");
        await user.selectOptions(display, "column:display name");
        await user.selectOptions(code, "column:display name");
        expect(
          screen.getByText(
            "Two source fields map to the same destination column.",
          ),
        ).toBeVisible();
        expect(put).toBeDisabled();
        await user.selectOptions(code, "column:customer_id");
        await user.selectOptions(
          screen.getByRole("combobox", { name: "Destination for extra" }),
          "skip",
        );
        expect(put).toBeEnabled();
        expect(
          screen.getByText(
            /INSERT INTO "main"\."target customers" \("customer_id", "display name"\)/,
          ),
        ).toBeVisible();
        const rowsBefore = database
          .prepare('SELECT * FROM "target customers"')
          .all();
        expect(rowsBefore).toEqual([]);
        await user.click(put);
        const sql = vi.mocked(props.onPutSqlInEditor).mock.lastCall?.[0];
        expect(sql).toBeTruthy();
        database.exec(sql!);
        expect(
          database.prepare('SELECT * FROM "target customers"').all(),
        ).toEqual([
          { customer_id: "0007", "display name": "O'Hara", region: "east" },
        ]);
      } finally {
        database.close();
      }
    },
  );
  // Pre-fix the dialog had no mode control at all: generateImportSql's tested
  // insert-only path (includeCreate = false) was unreachable from the UI.
  it("offers a create/append mode choice defaulting to create", () => {
    renderDialog();

    const group = screen.getByRole("radiogroup", { name: "Import mode" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Create new table" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Append to existing table" }),
    ).not.toBeChecked();
  });

  it("propagates the append choice into the preview state", async () => {
    const { user, props } = renderDialog();

    await user.click(
      screen.getByRole("radio", { name: "Append to existing table" }),
    );

    const updater = vi.mocked(props.onPreviewChange).mock.lastCall?.[0];
    expect(updater).toBeDefined();
    expect(applyUpdater(updater!, preview())).toMatchObject({
      mode: "append",
    });
    // The updater keeps a dismissed dialog dismissed.
    expect(applyUpdater(updater!, null as never)).toBeNull();
  });

  it("explains append mode next to the toggle", () => {
    renderDialog({ preview: preview({ mode: "append" }) });

    expect(
      screen.getByRole("radio", { name: "Append to existing table" }),
    ).toBeChecked();
    expect(
      screen.getByText(
        "Only INSERT statements are generated; the table must already exist.",
      ),
    ).toBeInTheDocument();
  });

  it("localizes the mode strings", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderDialog({ preview: preview({ mode: "append" }) });

    expect(
      screen.getByRole("radiogroup", { name: "インポートモード" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "新しいテーブルを作成" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "既存のテーブルに追記" }),
    ).toBeChecked();
  });
});

describe("ImportDialog structured log destination (#177 tier 4)", () => {
  it("shows the resolved profile and opens generated SQL in a new tab", () => {
    renderDialog({
      preview: preview({
        fileName: "app.log",
        format: "log",
        sourceLabel: "Common text",
        sqlDestination: "new-tab",
      }),
    });

    expect(screen.getByText("app.log · Common text")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open SQL in new tab" }),
    ).toBeVisible();
  });

  it("localizes the new-tab action", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderDialog({
      preview: preview({
        format: "log",
        sqlDestination: "new-tab",
      }),
    });

    expect(
      screen.getByRole("button", { name: "SQL を新しいタブで開く" }),
    ).toBeVisible();
  });
});
