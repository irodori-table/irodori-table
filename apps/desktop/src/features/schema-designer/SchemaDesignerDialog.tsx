import type { Dispatch, SetStateAction } from "react";
import { DialogShell } from "@/components/DialogShell";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import {
  schemaDraftId,
  type SchemaColumnDraft,
  type SchemaDesignerDraft,
  type SchemaDesignerMode,
  type SchemaForeignKeyDraft,
  type SchemaIndexDraft,
} from "./schema-designer";

export function SchemaDesignerDialog({
  draft,
  sqlPreview,
  onDraftChange,
  onClose,
  onCopySql,
  onPutSqlInEditor,
}: {
  draft: SchemaDesignerDraft;
  sqlPreview: string;
  onDraftChange: Dispatch<SetStateAction<SchemaDesignerDraft>>;
  onClose: () => void;
  onCopySql: () => void;
  onPutSqlInEditor: () => void;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);

  function updateColumn(id: string, patch: Partial<SchemaColumnDraft>) {
    onDraftChange((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    }));
  }

  function updateIndex(id: string, patch: Partial<SchemaIndexDraft>) {
    onDraftChange((current) => ({
      ...current,
      indexes: current.indexes.map((index) =>
        index.id === id ? { ...index, ...patch } : index,
      ),
    }));
  }

  function updateForeignKey(id: string, patch: Partial<SchemaForeignKeyDraft>) {
    onDraftChange((current) => ({
      ...current,
      foreignKeys: current.foreignKeys.map((foreignKey) =>
        foreignKey.id === id ? { ...foreignKey, ...patch } : foreignKey,
      ),
    }));
  }

  return (
    <DialogShell
      className="data-dialog schema-dialog"
      label={t("schemaDesigner.dialogLabel")}
      onClose={onClose}
    >
      <div className="dialog-header">
        <strong>{t("schemaDesigner.title")}</strong>
        <span>{draft.mode === "create" ? "CREATE TABLE" : "ALTER TABLE"}</span>
        <button className="text-button" type="button" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
      <div className="dialog-body schema-body">
        <div className="dialog-form-row schema-target">
          <label>
            <span>{t("schemaDesigner.mode")}</span>
            <select
              value={draft.mode}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  mode: event.currentTarget.value as SchemaDesignerMode,
                }))
              }
            >
              <option value="create">{t("schemaDesigner.modeCreate")}</option>
              <option value="alter">{t("schemaDesigner.modeAlter")}</option>
            </select>
          </label>
          <label>
            <span>{t("schemaDesigner.schema")}</span>
            <input
              value={draft.schema}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  schema: event.currentTarget.value,
                }))
              }
            />
          </label>
          <label>
            <span>{t("schemaDesigner.table")}</span>
            <input
              value={draft.table}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  table: event.currentTarget.value,
                }))
              }
            />
          </label>
        </div>

        <section className="designer-section">
          <header>
            <strong>{t("schemaDesigner.columns")}</strong>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                onDraftChange((current) => ({
                  ...current,
                  columns: [
                    ...current.columns,
                    {
                      id: schemaDraftId("column"),
                      name: "",
                      dataType: "TEXT",
                      nullable: true,
                      primaryKey: false,
                      defaultValue: "",
                    },
                  ],
                }))
              }
            >
              {t("schemaDesigner.addColumn")}
            </button>
          </header>
          <div className="designer-grid column-grid">
            {draft.columns.map((column) => {
              const locked = draft.mode === "alter" && column.existing;
              return (
                <div
                  className={`designer-row${column.existing ? " is-existing" : ""}`}
                  key={column.id}
                >
                  <input
                    aria-label={t("schemaDesigner.columnName")}
                    value={column.name}
                    disabled={locked}
                    onChange={(event) =>
                      updateColumn(column.id, {
                        name: event.currentTarget.value,
                      })
                    }
                  />
                  <input
                    aria-label={t("schemaDesigner.columnType")}
                    value={column.dataType}
                    disabled={locked}
                    onChange={(event) =>
                      updateColumn(column.id, {
                        dataType: event.currentTarget.value,
                      })
                    }
                  />
                  <label className="check-cell">
                    <input
                      type="checkbox"
                      checked={!column.nullable}
                      disabled={locked}
                      onChange={(event) =>
                        updateColumn(column.id, {
                          nullable: !event.currentTarget.checked,
                        })
                      }
                    />
                    <span>NN</span>
                  </label>
                  <label
                    className="check-cell"
                    title={
                      draft.mode === "alter"
                        ? t("schemaDesigner.alterPrimaryKeyUnavailable")
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={column.primaryKey}
                      // The generated ALTER TABLE ... ADD COLUMN never emits a
                      // PRIMARY KEY constraint (SQLite forbids it outright and
                      // the altered table usually has a key already), so the
                      // checkbox must not pretend otherwise (#120).
                      disabled={locked || draft.mode === "alter"}
                      onChange={(event) =>
                        updateColumn(column.id, {
                          primaryKey: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>PK</span>
                  </label>
                  <input
                    aria-label={t("schemaDesigner.defaultValue")}
                    value={column.defaultValue}
                    disabled={locked}
                    placeholder={t("schemaDesigner.defaultPlaceholder")}
                    onChange={(event) =>
                      updateColumn(column.id, {
                        defaultValue: event.currentTarget.value,
                      })
                    }
                  />
                  <button
                    className="mini-button"
                    type="button"
                    aria-label={t("schemaDesigner.removeColumn")}
                    title={t("schemaDesigner.removeColumn")}
                    disabled={locked}
                    onClick={() =>
                      onDraftChange((current) => ({
                        ...current,
                        columns: current.columns.filter(
                          (item) => item.id !== column.id,
                        ),
                      }))
                    }
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="designer-section">
          <header>
            <strong>{t("schemaDesigner.indexes")}</strong>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                onDraftChange((current) => ({
                  ...current,
                  indexes: [
                    ...current.indexes,
                    {
                      id: schemaDraftId("index"),
                      name: "",
                      columns: "",
                      unique: false,
                    },
                  ],
                }))
              }
            >
              {t("schemaDesigner.addIndex")}
            </button>
          </header>
          <div className="designer-grid index-grid">
            {draft.indexes.map((index) => {
              const locked = draft.mode === "alter" && index.existing;
              return (
                <div
                  className={`designer-row${index.existing ? " is-existing" : ""}`}
                  key={index.id}
                >
                  <input
                    aria-label={t("schemaDesigner.indexName")}
                    value={index.name}
                    disabled={locked}
                    placeholder={t("schemaDesigner.autoNamePlaceholder")}
                    onChange={(event) =>
                      updateIndex(index.id, {
                        name: event.currentTarget.value,
                      })
                    }
                  />
                  <input
                    aria-label={t("schemaDesigner.indexColumns")}
                    value={index.columns}
                    disabled={locked}
                    placeholder={t("schemaDesigner.indexColumnsPlaceholder")}
                    onChange={(event) =>
                      updateIndex(index.id, {
                        columns: event.currentTarget.value,
                      })
                    }
                  />
                  <label className="check-cell">
                    <input
                      type="checkbox"
                      checked={index.unique}
                      disabled={locked}
                      onChange={(event) =>
                        updateIndex(index.id, {
                          unique: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>{t("schemaDesigner.unique")}</span>
                  </label>
                  <button
                    className="mini-button"
                    type="button"
                    aria-label={t("schemaDesigner.removeIndex")}
                    title={t("schemaDesigner.removeIndex")}
                    disabled={locked}
                    onClick={() =>
                      onDraftChange((current) => ({
                        ...current,
                        indexes: current.indexes.filter(
                          (item) => item.id !== index.id,
                        ),
                      }))
                    }
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="designer-section">
          <header>
            <strong>{t("schemaDesigner.foreignKeys")}</strong>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                onDraftChange((current) => ({
                  ...current,
                  foreignKeys: [
                    ...current.foreignKeys,
                    {
                      id: schemaDraftId("fk"),
                      name: "",
                      columns: "",
                      referencesSchema: "",
                      referencesTable: "",
                      referencesColumns: "",
                      onDelete: "",
                    },
                  ],
                }))
              }
            >
              {t("schemaDesigner.addForeignKey")}
            </button>
          </header>
          <div className="designer-grid fk-grid">
            {draft.foreignKeys.map((foreignKey) => {
              const locked = draft.mode === "alter" && foreignKey.existing;
              return (
                <div
                  className={`designer-row${foreignKey.existing ? " is-existing" : ""}`}
                  key={foreignKey.id}
                >
                  <input
                    aria-label={t("schemaDesigner.foreignKeyName")}
                    value={foreignKey.name}
                    disabled={locked}
                    placeholder={t("schemaDesigner.autoNamePlaceholder")}
                    onChange={(event) =>
                      updateForeignKey(foreignKey.id, {
                        name: event.currentTarget.value,
                      })
                    }
                  />
                  <input
                    aria-label={t("schemaDesigner.foreignKeyColumns")}
                    value={foreignKey.columns}
                    disabled={locked}
                    placeholder={t("schemaDesigner.localColumnsPlaceholder")}
                    onChange={(event) =>
                      updateForeignKey(foreignKey.id, {
                        columns: event.currentTarget.value,
                      })
                    }
                  />
                  <input
                    aria-label={t("schemaDesigner.referencedSchema")}
                    value={foreignKey.referencesSchema}
                    disabled={locked}
                    placeholder={t(
                      "schemaDesigner.referencedSchemaPlaceholder",
                    )}
                    onChange={(event) =>
                      updateForeignKey(foreignKey.id, {
                        referencesSchema: event.currentTarget.value,
                      })
                    }
                  />
                  <input
                    aria-label={t("schemaDesigner.referencedTable")}
                    value={foreignKey.referencesTable}
                    disabled={locked}
                    placeholder={t("schemaDesigner.referencedTablePlaceholder")}
                    onChange={(event) =>
                      updateForeignKey(foreignKey.id, {
                        referencesTable: event.currentTarget.value,
                      })
                    }
                  />
                  <input
                    aria-label={t("schemaDesigner.referencedColumns")}
                    value={foreignKey.referencesColumns}
                    disabled={locked}
                    placeholder={t(
                      "schemaDesigner.referencedColumnsPlaceholder",
                    )}
                    onChange={(event) =>
                      updateForeignKey(foreignKey.id, {
                        referencesColumns: event.currentTarget.value,
                      })
                    }
                  />
                  <select
                    aria-label={t("schemaDesigner.onDelete")}
                    value={foreignKey.onDelete}
                    disabled={locked}
                    onChange={(event) =>
                      updateForeignKey(foreignKey.id, {
                        onDelete: event.currentTarget.value,
                      })
                    }
                  >
                    <option value="">ON DELETE</option>
                    <option value="CASCADE">CASCADE</option>
                    <option value="SET NULL">SET NULL</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="NO ACTION">NO ACTION</option>
                  </select>
                  <button
                    className="mini-button"
                    type="button"
                    aria-label={t("schemaDesigner.removeForeignKey")}
                    title={t("schemaDesigner.removeForeignKey")}
                    disabled={locked}
                    onClick={() =>
                      onDraftChange((current) => ({
                        ...current,
                        foreignKeys: current.foreignKeys.filter(
                          (item) => item.id !== foreignKey.id,
                        ),
                      }))
                    }
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <pre className="sql-preview schema-sql">{sqlPreview}</pre>
      </div>
      <div className="dialog-footer">
        <button className="text-button" type="button" onClick={onCopySql}>
          {t("common.copySql")}
        </button>
        <button
          className="primary-action"
          type="button"
          onClick={onPutSqlInEditor}
        >
          {t("common.putSqlInEditor")}
        </button>
      </div>
    </DialogShell>
  );
}
