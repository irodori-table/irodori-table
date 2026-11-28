import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Markdown } from "@/features/ai/chat/Markdown";
import { formatResultGridCell } from "@/features/results/result-view-model";
import type { QueryResult } from "@/generated/irodori-api";
import type { Translator } from "@/i18n";
import type { NotebookCell } from "./notebook-document";
import type { CellOutput } from "./use-notebook-runs";

type Translate = Translator["t"];

function CellResults({ result, t }: { result: QueryResult; t: Translate }) {
  const sets = result.resultSets?.length ? result.resultSets : [result];
  return sets.map((set, index) => (
    <div key={index} className="notebook-result">
      {sets.length > 1 && (
        <strong>{t("notebook.statement", { n: index + 1 })}</strong>
      )}
      {set.columns.length > 0 && (
        <div className="notebook-grid">
          <table aria-label={t("notebook.result")}>
            <thead>
              <tr>
                {set.columns.map((column, col) => (
                  <th key={col} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {set.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((value, col) => (
                    <td key={col}>{formatResultGridCell(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <small>
        {set.affectedRows != null
          ? t("notebook.affected", { n: String(set.affectedRows) })
          : t("notebook.rows", { n: String(set.rowCount) })}
      </small>
      {set.truncated && <small>{t("notebook.truncated")}</small>}
      {set.message && <small>{set.message}</small>}
    </div>
  ));
}

function Output({ output, t }: { output: CellOutput; t: Translate }) {
  return (
    <div className="notebook-output" aria-live="polite">
      <small>{t("notebook.outputOn", { name: output.connection })}</small>
      {output.state === "running" && (
        <p>{output.cancelError || t("notebook.running")}</p>
      )}
      {output.state === "cancelling" && <p>{t("notebook.cancelling")}</p>}
      {output.state === "cancelled" && <p>{t("notebook.cancelled")}</p>}
      {output.state === "skipped" && <p>{t("notebook.skipped")}</p>}
      {output.state === "error" && <p role="alert">{output.message}</p>}
      {output.state === "result" && (
        <CellResults result={output.result} t={t} />
      )}
    </div>
  );
}

type Props = {
  cell: NotebookCell;
  index: number;
  last: boolean;
  connected: boolean;
  output?: CellOutput;
  onEdit: (source: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onRun: () => void;
  onCancel: () => void;
  t: Translate;
};

export function NotebookCellEditor({
  cell,
  index,
  last,
  connected,
  output,
  onEdit,
  onMove,
  onDelete,
  onRun,
  onCancel,
  t,
}: Props) {
  const [preview, setPreview] = useState(false);
  const sql = cell.type === "sql";
  const busy = output?.state === "running" || output?.state === "cancelling";
  const label = t(sql ? "notebook.sqlCell" : "notebook.markdownCell", {
    n: index + 1,
  });
  return (
    <section className="notebook-cell" aria-label={label}>
      <header>
        <strong>{label}</strong>
        <button
          type="button"
          className="icon-button"
          aria-label={t("notebook.up")}
          title={t("notebook.up")}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("notebook.down")}
          title={t("notebook.down")}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("common.delete")}
          title={t("common.delete")}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
        {sql ? (
          busy ? (
            <button
              type="button"
              className="text-button"
              disabled={output.state === "cancelling"}
              onClick={onCancel}
            >
              {t("common.cancel")}
            </button>
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={!connected || !cell.source.trim()}
              onClick={onRun}
            >
              {t("notebook.run")}
            </button>
          )
        ) : (
          <button
            type="button"
            className="text-button"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {t(preview ? "notebook.edit" : "notebook.preview")}
          </button>
        )}
      </header>
      {preview ? (
        <div className="notebook-markdown">
          <Markdown text={cell.source} />
        </div>
      ) : (
        <textarea
          aria-label={label}
          className={sql ? "notebook-sql" : undefined}
          spellCheck={!sql}
          value={cell.source}
          readOnly={busy}
          onKeyDown={(event) => {
            if (
              sql &&
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter"
            ) {
              event.preventDefault();
              if (connected && !busy && cell.source.trim()) onRun();
            }
          }}
          onChange={(event) => onEdit(event.target.value)}
        />
      )}
      {output && <Output output={output} t={t} />}
    </section>
  );
}
