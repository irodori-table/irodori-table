import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { DialogShell } from "@/components/DialogShell";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import { localizedErrorMessage } from "@/core";
import type { DatabaseMetadata, DbEngine } from "@/generated/irodori-api";
import {
  buildImportPlan,
  generatePreviewSql,
  importMappingError,
  matchImportColumns,
  type ImportMapping,
  type ImportTextFormat,
  type ParsedImport,
} from "./importers";
import { saveImportScript } from "./save-import";

/**
 * "create" emits `CREATE TABLE ... ; INSERT ...`, "append" emits only the
 * INSERT so rows can be loaded into a table that already exists.
 */
export type ImportMode = "create" | "append";
export type ImportSqlDestination = "active-tab" | "new-tab";

export type ImportPreview = ParsedImport & {
  fileName: string;
  format: ImportTextFormat | "log";
  /** Optional, localized detail such as the resolved log profile name. */
  sourceLabel?: string;
  sourceFile?: File;
  columnTypes?: string[];
  tableName: string;
  mode: ImportMode;
  /** Log imports preserve their source buffer by opening SQL elsewhere. */
  sqlDestination?: ImportSqlDestination;
};

export function ImportDialog({
  preview,
  engine,
  connectionId,
  metadata,
  onPreviewChange,
  onClose,
  onPutSqlInEditor,
  formatCell,
  formatCount,
}: {
  /** Always present: the dialog is only mounted while a preview exists. */
  preview: ImportPreview;
  engine: DbEngine;
  connectionId: string;
  metadata?: DatabaseMetadata;
  onPreviewChange: Dispatch<SetStateAction<ImportPreview | null>>;
  onClose: () => void;
  onPutSqlInEditor: (sql: string) => void;
  formatCell: (value: unknown) => string;
  formatCount: (value: bigint | number) => string;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [mapping, setMapping] = useState<
    (ImportMapping & { source: string[] }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const saveController = useRef<AbortController | null>(null);
  useEffect(() => () => saveController.current?.abort(), [preview.sourceFile]);
  const tables = useMemo(
    () =>
      metadata?.schemas.flatMap((schema) =>
        schema.objects.filter((obj) => obj.kind === "table"),
      ) ?? [],
    [metadata],
  );
  const mapped =
    preview.mode === "append" && mapping?.source === preview.columns
      ? mapping
      : null;
  const tableIndex =
    mapped?.connectionId === connectionId
      ? tables.findIndex(
          (obj) => obj.schema === mapped.schema && obj.name === mapped.table,
        )
      : -1;
  const target = tables[tableIndex];
  const problem = mapped ? importMappingError(mapped, target) : null;
  const plan = useMemo(() => {
    if (problem || !preview.columns.length) return null;
    return buildImportPlan({
      tableName: preview.tableName,
      engine,
      rows: preview.rows,
      columns: preview.columns,
      columnTypes: preview.columnTypes,
      includeCreate: preview.mode === "create",
      mapped:
        mapped && target
          ? { table: target, choices: mapped.choices }
          : undefined,
    });
  }, [preview, engine, problem, mapped, target]);
  const sqlPreview = useMemo(
    () => (plan ? generatePreviewSql(plan, preview.rows) : ""),
    [plan, preview.rows],
  );
  const delimited =
    preview.format === "csv" || preview.format === "tsv"
      ? preview.format
      : undefined;
  const setTable = (value: string) => {
    const target = value ? tables[Number(value)] : undefined;
    setMapping(
      target
        ? {
            connectionId,
            schema: target.schema,
            table: target.name,
            source: preview.columns,
            choices: matchImportColumns(preview.columns, target),
          }
        : null,
    );
    setSaveStatus("");
  };
  async function saveFullFile() {
    if (!plan || !delimited || !preview.sourceFile || saveController.current)
      return;
    const control = new AbortController();
    saveController.current = control;
    setSaving(true);
    setSaveStatus("");
    try {
      if (
        await saveImportScript(
          preview.sourceFile,
          delimited,
          plan,
          preview.totalRows,
          control.signal,
        )
      ) {
        setSaveStatus(
          t("import.dialog.saved", { total: formatCount(preview.totalRows) }),
        );
      }
    } catch (error) {
      if (
        !control.signal.aborted &&
        !(error instanceof Error && error.name === "AbortError")
      ) {
        setSaveStatus(localizedErrorMessage(t, error));
      }
    } finally {
      saveController.current = null;
      setSaving(false);
    }
  }
  const setMode = (mode: ImportMode) =>
    onPreviewChange((current) => (current ? { ...current, mode } : current));
  function dismiss() {
    saveController.current?.abort();
    onClose();
  }

  return (
    <DialogShell
      className="data-dialog import-dialog"
      label={t("import.dialog.label")}
      onClose={dismiss}
    >
      <div className="dialog-header">
        <strong>{t("import.dialog.title")}</strong>
        <span>{`${preview.fileName} \u00b7 ${preview.sourceLabel ?? preview.format.toUpperCase()}`}</span>
        <button className="text-button" type="button" onClick={dismiss}>
          {t("common.close")}
        </button>
      </div>
      <div className="dialog-body" inert={saving}>
        <div className="dialog-form-row">
          <label>
            <span>{t("import.dialog.table")}</span>
            <input
              disabled={Boolean(mapped)}
              value={
                mapped
                  ? [mapped.schema, mapped.table].filter(Boolean).join(".")
                  : preview.tableName
              }
              onChange={(event) => {
                const name = event.currentTarget.value;
                onPreviewChange((current) =>
                  current
                    ? {
                        ...current,
                        tableName: name,
                      }
                    : current,
                );
              }}
            />
          </label>
          <span className="dialog-stat">
            {t(
              preview.truncated
                ? "import.dialog.rowCountCapped"
                : "import.dialog.rowCount",
              {
                shown: formatCount(preview.rows.length),
                total: formatCount(preview.totalRows),
              },
            )}
          </span>
        </div>
        <div
          className="dialog-form-row import-mode-row"
          role="radiogroup"
          aria-label={t("import.mode.label")}
        >
          <label className="import-mode-option">
            <input
              type="radio"
              name="import-mode"
              checked={preview.mode !== "append"}
              onChange={() => setMode("create")}
            />
            <span>{t("import.mode.create")}</span>
          </label>
          <label className="import-mode-option">
            <input
              type="radio"
              name="import-mode"
              checked={preview.mode === "append"}
              onChange={() => setMode("append")}
            />
            <span>{t("import.mode.append")}</span>
          </label>
          {preview.mode === "append" ? (
            <span className="import-mode-hint">
              {t("import.mode.appendHint")}
            </span>
          ) : null}
        </div>
        {preview.mode === "append" &&
          delimited &&
          (tables.length > 0 || mapped) && (
            <div className="import-mapping">
              <label>
                {t("import.mapping.table")}
                <select
                  value={
                    mapped
                      ? tableIndex < 0
                        ? "missing"
                        : String(tableIndex)
                      : ""
                  }
                  onChange={(event) => setTable(event.currentTarget.value)}
                >
                  <option value="">{t("import.mapping.manual")}</option>
                  {mapped && !target && (
                    <option value="missing" disabled>
                      {mapped.schema}.{mapped.table}
                    </option>
                  )}
                  {tables.map((obj, index) => (
                    <option
                      key={JSON.stringify([obj.schema, obj.name])}
                      value={index}
                    >
                      {[obj.schema, obj.name].filter(Boolean).join(".")}
                    </option>
                  ))}
                </select>
              </label>
              {mapped &&
                target &&
                preview.columns.map((source, index) => (
                  <label key={index}>
                    {source}
                    <select
                      aria-label={t("import.mapping.column", { source })}
                      value={columnChoiceValue(mapped.choices[index])}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        const choices = [...mapped.choices];
                        choices[index] =
                          value === "skip"
                            ? ""
                            : value === "choose"
                              ? null
                              : value.slice("column:".length);
                        setMapping({ ...mapped, choices });
                        setSaveStatus("");
                      }}
                    >
                      <option value="choose">
                        {t("import.mapping.choose")}
                      </option>
                      <option value="skip">{t("import.mapping.skip")}</option>
                      {target.columns.map((column) => (
                        <option
                          key={column.name}
                          value={columnChoiceValue(column.name)}
                        >
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              {problem && <p role="status">{t(problem)}</p>}
            </div>
          )}
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                {preview.columns.map((column, index) => (
                  <th key={`${column}-${index}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 8).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {preview.columns.map((_, columnIndex) => (
                    <td key={columnIndex}>{formatCell(row[columnIndex])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="sql-preview">{sqlPreview}</pre>
      </div>
      <div className="dialog-footer">
        {saveStatus && <span role="status">{saveStatus}</span>}
        {delimited &&
          preview.sourceFile &&
          (saving ? (
            <button
              type="button"
              className="text-button"
              onClick={() => saveController.current?.abort()}
            >
              {t("import.dialog.cancelSave")}
            </button>
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={!plan}
              onClick={() => void saveFullFile()}
            >
              {t("import.dialog.saveFull", {
                total: formatCount(preview.totalRows),
              })}
            </button>
          ))}
        <button
          className="text-button"
          type="button"
          disabled={!plan || saving}
          onClick={() => void navigator.clipboard?.writeText(sqlPreview)}
        >
          {t(
            preview.truncated ? "import.dialog.copyPreview" : "common.copySql",
          )}
        </button>
        <button
          className="primary-action"
          type="button"
          disabled={!plan || saving}
          onClick={() => onPutSqlInEditor(sqlPreview)}
        >
          {t(
            preview.truncated && !preview.sqlDestination
              ? "import.dialog.putPreview"
              : preview.sqlDestination === "new-tab"
                ? "common.openSqlInNewTab"
                : "common.putSqlInEditor",
          )}
        </button>
      </div>
    </DialogShell>
  );
}

function columnChoiceValue(choice: string | null): string {
  if (choice === null) return "choose";
  return choice === "" ? "skip" : "column:" + choice;
}
