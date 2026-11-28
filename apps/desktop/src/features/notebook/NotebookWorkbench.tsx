import { useRef, useState } from "react";
import { X } from "lucide-react";
import { DialogShell } from "@/components/DialogShell";
import { useConfirm } from "@/components/ConfirmDialog";
import { errorMessage } from "@/core/errors";
import { downloadBlob } from "@/features/erd/erd-export";
import type { Translator } from "@/i18n";
import { NotebookCellEditor } from "./NotebookCellEditor";
import {
  notebookCell,
  notebookDocument,
  notebookExtension,
  parseNotebook,
  serializeNotebook,
  type NotebookCell,
  type NotebookDocument,
} from "./notebook-document";
import { useNotebookRuns, type NotebookExecution } from "./use-notebook-runs";
import "./notebook.css";

type Props = {
  open: boolean;
  onClose: () => void;
  connections: { id: string; name: string }[];
  connected: boolean;
  onSelectConnection: (id: string) => void;
  onConnect: () => Promise<void>;
  execution: NotebookExecution;
  t: Translator["t"];
};

export function NotebookWorkbench({
  open,
  onClose,
  connections,
  connected,
  onSelectConnection,
  onConnect,
  execution,
  t,
}: Props) {
  const nextNumber = useRef(1);
  const [docs, setDocs] = useState(() => [
    notebookDocument(t("notebook.untitled", { n: 1 })),
  ]);
  const [activeId, setActiveId] = useState(docs[0].id);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const { confirm, confirmElement } = useConfirm();
  const { outputs, runCell, cancelCell, clearOutput } =
    useNotebookRuns(execution);
  const doc = docs.find((item) => item.id === activeId) ?? docs[0];

  function newDocument() {
    return notebookDocument(
      t("notebook.untitled", { n: ++nextNumber.current }),
    );
  }

  function appendDocument(next: NotebookDocument) {
    setDocs((current) => [...current, next]);
    setActiveId(next.id);
    setFileError("");
  }

  function changeDocument(
    update: (current: NotebookDocument) => NotebookDocument,
  ) {
    setDocs((current) =>
      current.map((item) =>
        item.id === doc.id ? { ...update(item), dirty: true } : item,
      ),
    );
  }

  function changeCells(update: (cells: NotebookCell[]) => NotebookCell[]) {
    changeDocument((item) => ({ ...item, cells: update(item.cells) }));
  }

  function moveCell(id: string, delta: -1 | 1) {
    changeCells((cells) => {
      const index = cells.findIndex((cell) => cell.id === id);
      const destination = index + delta;
      if (index < 0 || destination < 0 || destination >= cells.length)
        return cells;
      const next = [...cells];
      next.splice(destination, 0, ...next.splice(index, 1));
      return next;
    });
  }

  async function closeDocument() {
    if (
      doc.dirty &&
      !(await confirm({
        title: t("notebook.discardTitle"),
        message: t("notebook.discard", { name: doc.name }),
        confirmLabel: t("notebook.closeTab"),
      }))
    )
      return;
    doc.cells.forEach((cell) => clearOutput(cell.id));
    const next =
      docs[docs.indexOf(doc) + 1] ??
      docs[docs.indexOf(doc) - 1] ??
      newDocument();
    setDocs((current) => {
      const remaining = current.filter((item) => item.id !== doc.id);
      return remaining.length ? remaining : [next];
    });
    setActiveId((current) => (current === doc.id ? next.id : current));
    setFileError("");
  }

  async function openFile(file: File) {
    try {
      const name = file.name.replace(/\.irodori-notebook\.json$/i, "");
      const result = parseNotebook(await file.text(), name);
      if (!result) {
        setFileError(t("notebook.invalid"));
        return;
      }
      appendDocument(result);
    } catch (error) {
      setFileError(errorMessage(error));
    }
  }

  async function saveFile() {
    setSaving(true);
    setFileError("");
    const name =
      doc.name
        .trim()
        .replace(/[/\\]/g, "-")
        .replace(/\.irodori-notebook\.json$/i, "") || t("notebook.title");
    try {
      const blob = new Blob([serializeNotebook(doc)], {
        type: "application/json",
      });
      const outcome = await downloadBlob(blob, name + notebookExtension);
      if (outcome.kind !== "cancelled") {
        // Edits made while the native save picker was open are still unsaved.
        setDocs((current) =>
          current.map((item) =>
            item === doc ? { ...item, dirty: false } : item,
          ),
        );
      }
    } catch (error) {
      setFileError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function connect() {
    setConnecting(true);
    try {
      await onConnect();
    } catch (error) {
      setFileError(errorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  if (!open) return null;
  const hasTarget = connections.some(({ id }) => id === execution.target.id);
  const running = doc.cells.some(
    (cell) =>
      outputs[cell.id]?.state === "running" ||
      outputs[cell.id]?.state === "cancelling",
  );
  return (
    <div
      role="presentation"
      onKeyDown={(event) => {
        // The workbench has window-level shortcuts for the SQL editor underneath.
        event.stopPropagation();
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (!saving) void saveFile();
        }
      }}
    >
      <DialogShell
        className="data-dialog notebook-dialog"
        label={t("notebook.title")}
        onClose={onClose}
      >
        <header className="dialog-header">
          <strong>{t("notebook.title")}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="notebook-toolbar">
          <button
            type="button"
            className="text-button"
            onClick={() => appendDocument(newDocument())}
          >
            {t("notebook.new")}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => picker.current?.click()}
          >
            {t("notebook.open")}
          </button>
          <input
            ref={picker}
            hidden
            type="file"
            accept={notebookExtension + ",.json"}
            aria-label={t("notebook.open")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void openFile(file);
            }}
          />
          <button
            type="button"
            className="text-button"
            disabled={saving}
            onClick={() => void saveFile()}
          >
            {t("common.save")}
          </button>
          <label>
            {t("notebook.connection")}
            <select
              disabled={connecting}
              value={hasTarget ? execution.target.id : ""}
              onChange={(event) => onSelectConnection(event.target.value)}
            >
              {!hasTarget && (
                <option value="">{t("notebook.chooseConnection")}</option>
              )}
              {connections.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {!connected && (
            <button
              type="button"
              className="text-button"
              disabled={connecting}
              onClick={() => void connect()}
            >
              {t(connecting ? "connection.connecting" : "connection.connect")}
            </button>
          )}
        </div>
        {fileError && (
          <p role="alert" className="notebook-file-error">
            {fileError}
          </p>
        )}
        <div
          role="tablist"
          className="notebook-tabs"
          aria-label={t("notebook.documents")}
        >
          {docs.map((item, index) => (
            <button
              type="button"
              role="tab"
              key={item.id}
              id={`notebook-tab-${item.id}`}
              aria-selected={doc.id === item.id}
              aria-controls={`notebook-panel-${item.id}`}
              tabIndex={doc.id === item.id ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => {
                const position = {
                  ArrowLeft: index - 1,
                  ArrowRight: index + 1,
                  Home: 0,
                  End: docs.length - 1,
                }[event.key];
                if (position === undefined) return;
                event.preventDefault();
                const tab = docs[(position + docs.length) % docs.length];
                setActiveId(tab.id);
                document.getElementById(`notebook-tab-${tab.id}`)?.focus();
              }}
            >
              {item.name || t("notebook.title")}
              {item.dirty ? " *" : ""}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          className="dialog-body"
          id={`notebook-panel-${doc.id}`}
          aria-labelledby={`notebook-tab-${doc.id}`}
        >
          <div className="notebook-actions">
            <label>
              {t("notebook.name")}
              <input
                value={doc.name}
                onChange={(event) => {
                  const name = event.target.value;
                  changeDocument((item) => ({ ...item, name }));
                }}
              />
            </label>
            <button
              type="button"
              className="text-button"
              disabled={running || saving}
              onClick={() => void closeDocument()}
            >
              {t("notebook.closeTab")}
            </button>
          </div>
          {doc.cells.map((cell, index) => (
            <NotebookCellEditor
              key={cell.id}
              cell={cell}
              index={index}
              last={index === doc.cells.length - 1}
              connected={connected}
              output={outputs[cell.id]}
              t={t}
              onEdit={(source) => {
                clearOutput(cell.id);
                changeCells((cells) =>
                  cells.map((item) =>
                    item.id === cell.id ? { ...item, source } : item,
                  ),
                );
              }}
              onMove={(delta) => moveCell(cell.id, delta)}
              onDelete={() => {
                clearOutput(cell.id);
                changeCells((cells) =>
                  cells.filter((item) => item.id !== cell.id),
                );
              }}
              onRun={() => void runCell(cell)}
              onCancel={() =>
                void cancelCell(cell.id, t("notebook.cancelUnavailable"))
              }
            />
          ))}
          <div className="notebook-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const cell = notebookCell("sql");
                changeCells((cells) => [...cells, cell]);
              }}
            >
              {t("notebook.addSql")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const cell = notebookCell("markdown");
                changeCells((cells) => [...cells, cell]);
              }}
            >
              {t("notebook.addMarkdown")}
            </button>
          </div>
        </div>
      </DialogShell>
      {confirmElement}
    </div>
  );
}
