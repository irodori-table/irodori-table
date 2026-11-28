import { useState } from "react";
import { DialogShell } from "@/components/DialogShell";
import type { DbObjectMetadata } from "@/generated/irodori-api";
import type { Translator } from "@/i18n";
import {
  tableFilterOperators,
  unfilteredTable,
  type TableBrowse,
} from "@/features/workbench/object-sql";

export type DatabaseBrowseControl = {
  key: string;
  object: DbObjectMetadata;
  options: TableBrowse;
  apply: (options: TableBrowse) => Promise<void>;
};

export function DatabaseTableFilter({
  browse,
  disabled,
  t,
}: {
  browse: DatabaseBrowseControl;
  disabled: boolean;
  t: Translator["t"];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(browse.options);
  function apply(next: TableBrowse) {
    setOpen(false);
    void browse.apply(next);
  }
  const columnChoices = browse.object.columns.map(({ name }) => (
    <option key={name} value={name}>
      {name}
    </option>
  ));
  return (
    <>
      <button
        type="button"
        className="text-button"
        aria-haspopup="dialog"
        aria-pressed={Boolean(
          browse.options.column || browse.options.sortColumn,
        )}
        disabled={disabled}
        onClick={() => {
          setDraft(browse.options);
          setOpen(true);
        }}
      >
        {t("results.databaseFilter")}
      </button>
      {open && (
        <DialogShell
          className="data-dialog"
          label={t("results.databaseFilter")}
          onClose={() => setOpen(false)}
        >
          <div className="dialog-header">
            <strong>{t("results.databaseFilter")}</strong>
            <span>
              {[browse.object.schema, browse.object.name]
                .filter(Boolean)
                .join(".")}
            </span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply(draft);
            }}
          >
            <div className="dialog-body">
              <div className="dialog-form-row">
                <label>
                  {t("results.databaseFilterColumn")}
                  <select
                    value={draft.column}
                    onChange={(e) =>
                      setDraft({ ...draft, column: e.currentTarget.value })
                    }
                  >
                    <option value="">{t("results.databaseNoFilter")}</option>
                    {columnChoices}
                  </select>
                </label>
                <label>
                  {t("results.databaseOperator")}
                  <select
                    disabled={!draft.column}
                    value={draft.operator}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        operator: e.currentTarget
                          .value as TableBrowse["operator"],
                      })
                    }
                  >
                    {tableFilterOperators.map((operator) => (
                      <option key={operator}>{operator}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("results.databaseValue")}
                  <input
                    disabled={!draft.column || draft.operator.startsWith("IS ")}
                    value={draft.value}
                    onChange={(e) =>
                      setDraft({ ...draft, value: e.currentTarget.value })
                    }
                  />
                </label>
              </div>
              <div className="dialog-form-row">
                <label>
                  {t("results.databaseSortColumn")}
                  <select
                    value={draft.sortColumn}
                    onChange={(e) =>
                      setDraft({ ...draft, sortColumn: e.currentTarget.value })
                    }
                  >
                    <option value="">{t("results.databaseNoSort")}</option>
                    {columnChoices}
                  </select>
                </label>
                <label>
                  {t("results.databaseDirection")}
                  <select
                    disabled={!draft.sortColumn}
                    value={draft.direction}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        direction:
                          e.currentTarget.value === "desc" ? "desc" : "asc",
                      })
                    }
                  >
                    <option value="asc">ASC</option>
                    <option value="desc">DESC</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => apply(unfilteredTable)}
              >
                {t("common.clear")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={disabled || draft.value.includes("\0")}
              >
                {t("common.apply")}
              </button>
            </div>
          </form>
        </DialogShell>
      )}
    </>
  );
}
