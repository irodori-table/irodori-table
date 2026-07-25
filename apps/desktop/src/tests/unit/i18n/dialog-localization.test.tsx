import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ImportDialog,
  type ImportPreview,
} from "@/features/import/ImportDialog";
import { SchemaDesignerDialog } from "@/features/schema-designer/SchemaDesignerDialog";
import { SearchReplacePanel } from "@/features/search/SearchReplacePanel";
import { usePreferencesStore } from "@/features/preferences";
import { renderUi } from "@/tests/helpers/render";

/**
 * #133: these dialogs contained no `t()` call at all, so a `ja` user saw them
 * fully in English, action buttons included. The sibling scan
 * (`untranslated-surfaces.test.ts`) proves each file *reaches* i18n; this one
 * proves the strings actually change with the locale, which a scan cannot.
 */

beforeEach(() => {
  usePreferencesStore.setState({ locale: "ja" });
});

const importPreview: ImportPreview = {
  columns: ["id", "name"],
  rows: [[1, "Ada"]],
  totalRows: 1,
  truncated: false,
  fileName: "people.csv",
  format: "csv",
  tableName: "people",
  mode: "create",
};

describe("dialogs render in the active locale", () => {
  it("ImportDialog translates its chrome and actions", () => {
    renderUi(
      <ImportDialog
        preview={importPreview}
        sqlPreview="CREATE TABLE people (...)"
        onPreviewChange={vi.fn()}
        onClose={vi.fn()}
        onPutSqlInEditor={vi.fn()}
        formatCell={String}
        formatCount={String}
      />,
    );

    expect(
      screen.getByRole("button", { name: "SQL をコピー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SQL をエディタに挿入" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Copy SQL")).not.toBeInTheDocument();
  });

  it("SchemaDesignerDialog translates its section headings and controls", () => {
    renderUi(
      <SchemaDesignerDialog
        draft={{
          mode: "create",
          schema: "public",
          table: "people",
          columns: [],
          indexes: [],
          foreignKeys: [],
        }}
        sqlPreview="CREATE TABLE people (...)"
        onDraftChange={vi.fn()}
        onClose={vi.fn()}
        onCopySql={vi.fn()}
        onPutSqlInEditor={vi.fn()}
      />,
    );

    expect(screen.getByText("カラム")).toBeInTheDocument();
    expect(screen.getByText("インデックス")).toBeInTheDocument();
    expect(screen.getByText("外部キー")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SQL をエディタに挿入" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Foreign Keys")).not.toBeInTheDocument();
  });

  it("SearchReplacePanel translates its placeholders and summary", () => {
    renderUi(
      <SearchReplacePanel
        tabs={[]}
        onReveal={vi.fn()}
        onReplaceTab={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByPlaceholderText("すべてのタブから検索"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "入力すると開いているすべてのエディタタブを検索します。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search across all tabs"),
    ).not.toBeInTheDocument();
  });

  it("falls back to English when the locale is en", () => {
    usePreferencesStore.setState({ locale: "en" });
    renderUi(
      <SearchReplacePanel
        tabs={[]}
        onReveal={vi.fn()}
        onReplaceTab={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByPlaceholderText("Search across all tabs"),
    ).toBeInTheDocument();
  });
});
