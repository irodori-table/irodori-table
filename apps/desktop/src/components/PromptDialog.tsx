import { useCallback, useState, type ReactNode } from "react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import { DialogShell } from "./DialogShell";

export type PromptOptions = {
  title: string;
  /** Visible field label; keep it short ("Tab name", "Database name"). */
  label: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type PromptDialogProps = PromptOptions & {
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/**
 * Shared single-input modal. Pair with {@link usePrompt} for ad-hoc prompts the
 * way {@link ConfirmDialog}/{@link useConfirm} cover yes/no.
 *
 * Replaces `window.prompt`, whose WebKitGTK dialog is titled
 * "JavaScript - tauri://localhost" and looks nothing like the app.
 */
export function PromptDialog({
  title,
  label,
  defaultValue = "",
  placeholder,
  confirmLabel,
  cancelLabel,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();
  return (
    <DialogShell
      onClose={onCancel}
      className="data-dialog prompt-dialog"
      label={title}
    >
      <div className="dialog-header">
        <strong>{title}</strong>
      </div>
      <div className="dialog-body">
        <div className="dialog-form-row">
          <label>
            <span>{label}</span>
            <input
              value={value}
              placeholder={placeholder}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && trimmed) {
                  event.preventDefault();
                  onSubmit(trimmed);
                }
              }}
            />
          </label>
        </div>
      </div>
      <div className="dialog-footer">
        <button type="button" className="text-button" onClick={onCancel}>
          {cancelLabel ?? t("common.cancel")}
        </button>
        <button
          type="button"
          className="text-button primary"
          disabled={!trimmed}
          onClick={() => onSubmit(trimmed)}
        >
          {confirmLabel ?? t("common.confirm")}
        </button>
      </div>
    </DialogShell>
  );
}

type PromptState = PromptOptions & {
  resolve: (value: string | null) => void;
};

/**
 * Imperative text prompt. Returns `prompt(options) => Promise<string | null>`
 * (null when cancelled) and the `promptElement` to render once near the owner,
 * so a handler can `const next = await prompt({...}); if (!next) return;`
 * without threading per-action dialog state.
 */
export function usePrompt() {
  const [state, setState] = useState<PromptState | null>(null);

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setState({ ...options, resolve });
      }),
    [],
  );

  const settle = useCallback((value: string | null) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const promptElement = state ? (
    <PromptDialog
      title={state.title}
      label={state.label}
      defaultValue={state.defaultValue}
      placeholder={state.placeholder}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      onSubmit={(value) => settle(value)}
      onCancel={() => settle(null)}
    />
  ) : null;

  return { prompt, promptElement };
}
