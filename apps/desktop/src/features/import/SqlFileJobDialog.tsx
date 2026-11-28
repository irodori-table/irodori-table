import { useEffect, useRef, useState } from "react";
import { DialogShell } from "@/components/DialogShell";
import { errorMessage } from "@/core";
import {
  dbPickSqlFile,
  dbFinishSqlFile,
  type SqlFilePreview,
} from "@/generated/irodori-api";
import type { Translator } from "@/i18n";

type Props = {
  connectionId: string;
  connectionName: string;
  writable: boolean;
  onStarted: () => void;
  onClose: () => void;
  t: Translator["t"];
};

export function SqlFileJobDialog({
  connectionId,
  connectionName,
  writable,
  onStarted,
  onClose,
  t,
}: Props) {
  const [selection, setSelection] = useState<SqlFilePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const held = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (held.current !== null)
        void dbFinishSqlFile(connectionId, held.current, false).catch(() => {});
    };
  }, [connectionId]);

  async function pick() {
    setBusy(true);
    setError("");
    try {
      const next = await dbPickSqlFile(connectionId);
      if (!next) return;
      if (!mounted.current) {
        await dbFinishSqlFile(connectionId, next.token, false);
        return;
      }
      held.current = next.token;
      setSelection(next);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function start() {
    if (!selection || busy) return;
    setBusy(true);
    setError("");
    try {
      await dbFinishSqlFile(connectionId, selection.token, true);
      held.current = null;
      if (mounted.current) onStarted();
    } catch (e) {
      if (mounted.current) {
        held.current = null;
        setSelection(null);
        setError(errorMessage(e));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <DialogShell
      className="data-dialog import-dialog"
      label={t("commands.query.runFile.title")}
      onClose={onClose}
      closeOnEscape={!busy}
      closeOnOverlayClick={!busy}
    >
      <div className="dialog-header">
        <strong>{t("commands.query.runFile.title")}</strong>
      </div>
      <div className="dialog-body">
        {writable ? (
          <strong>
            {connectionName} · {connectionId}
            {selection ? ` · ${selection.database}` : ""}
          </strong>
        ) : (
          <p>{t("sqlFile.requireConnection")}</p>
        )}
        {writable && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void pick()}
          >
            {t("sqlFile.choose")}
          </button>
        )}
        {selection && (
          <>
            <p>{t("sqlFile.review")}</p>
            <strong>
              {selection.name} · {Number(selection.size).toLocaleString()} B
            </strong>
            <small>
              {t("sqlFile.preview", { bytes: selection.previewBytes })}
            </small>
            <pre className="sql-preview">{selection.preview}</pre>
          </>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button
          type="button"
          className="text-button"
          onClick={onClose}
          disabled={busy}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => void start()}
          disabled={busy || !writable || !selection}
        >
          {t("sqlFile.run")}
        </button>
      </div>
    </DialogShell>
  );
}
