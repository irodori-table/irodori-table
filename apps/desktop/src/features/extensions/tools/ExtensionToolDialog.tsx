import { useEffect, useMemo, useState } from "react";
import { Copy, FileText } from "lucide-react";
import { DialogShell } from "@/components/DialogShell";
import { errorMessage } from "@/core";
import { usePreferencesStore } from "@/features/preferences";
import { extToolRun } from "@/generated/irodori-api";
import { createTranslator, type Translator } from "@/i18n";
import {
  decodeToolOutput,
  defaultToolValues,
  localize,
  type ExtensionTool,
  type ToolFormField,
  type ToolFormSection,
  type ToolOutput,
  type ToolOutputTab,
  type ToolValues,
} from "./extension-tools";

/**
 * Each change runs the tool in a new process, so wait for a pause in typing. It
 * is short enough that the output still feels like it follows the form.
 */
const RUN_DELAY_MS = 150;

type ExtensionToolDialogProps = {
  tool: ExtensionTool;
  onClose: () => void;
  onCopyText: (text: string, label: string) => void;
  onPutTextInEditor: (text: string) => void;
};

export function ExtensionToolDialog({
  tool,
  onClose,
  onCopyText,
  onPutTextInEditor,
}: ExtensionToolDialogProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = useMemo(() => createTranslator(locale), [locale]);
  const [values, setValues] = useState<ToolValues>(() =>
    defaultToolValues(tool),
  );
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRunning(true);
    const timer = window.setTimeout(() => {
      extToolRun(tool.extensionId, tool.id, values, locale)
        .then((response) => {
          if (!cancelled) {
            setOutput(decodeToolOutput(response));
            setError(null);
            setRunning(false);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(errorMessage(reason));
            setRunning(false);
          }
        });
    }, RUN_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locale, tool.extensionId, tool.id, values]);

  const title = localize(tool.title, locale);
  const tabs = output?.tabs ?? [];
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <DialogShell
      className="data-dialog tool-dialog"
      label={title}
      onClose={onClose}
    >
      <div className="dialog-header">
        <strong>{title}</strong>
        <span>{running ? t("tool.running") : (output?.title ?? "")}</span>
        <button className="text-button" type="button" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
      <div className="dialog-body tool-body">
        <section className="tool-form" aria-label={t("tool.inputs")}>
          {tool.sections.map((section, index) => (
            <ToolFormSectionFields
              key={index}
              section={section}
              locale={locale}
              values={values}
              onChange={(id, value) =>
                setValues((current) => ({ ...current, [id]: value }))
              }
            />
          ))}
        </section>

        <section className="tool-preview" aria-label={t("tool.output")}>
          <div
            className="segmented-control tool-tabs"
            aria-label={t("tool.output")}
          >
            {tabs.map((tab) => (
              <button
                className={tab.id === activeTab?.id ? "active" : undefined}
                type="button"
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.title}
              </button>
            ))}
          </div>
          <div className="tool-result">
            {error ? (
              <div className="tool-notes warning" role="alert">
                <strong>{t("tool.failed")}</strong>
                <p>{error}</p>
              </div>
            ) : null}
            {activeTab?.kind === "overview" ? (
              <ToolOverview tab={activeTab} />
            ) : activeTab ? (
              <pre className="sql-preview tool-output">{activeTab.text}</pre>
            ) : null}
          </div>
        </section>
      </div>
      <div className="dialog-footer">
        <button
          className="text-button"
          type="button"
          disabled={!activeTab}
          onClick={() => {
            if (activeTab) {
              onCopyText(activeTab.text, activeTab.title);
            }
          }}
        >
          <Copy size={14} />
          <span>{t("common.copy")}</span>
        </button>
        <button
          className="primary-action"
          type="button"
          disabled={!activeTab}
          onClick={() => {
            if (activeTab) {
              onPutTextInEditor(activeTab.text);
            }
          }}
        >
          <FileText size={14} />
          <span>{putLabel(activeTab, t)}</span>
        </button>
      </div>
    </DialogShell>
  );
}

function putLabel(tab: ToolOutputTab | undefined, t: Translator["t"]) {
  return tab?.kind === "code" ? t("tool.putSql") : t("tool.putText");
}

function ToolFormSectionFields({
  section,
  locale,
  values,
  onChange,
}: {
  section: ToolFormSection;
  locale: string;
  values: ToolValues;
  onChange: (id: string, value: ToolValues[string]) => void;
}) {
  const checks = section.fields.filter((field) => field.type === "boolean");
  const inputs = section.fields.filter((field) => field.type !== "boolean");
  return (
    <>
      {inputs.length > 0 ? (
        <div
          className="tool-form-grid"
          style={{
            gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))`,
          }}
        >
          {inputs.map((field) => (
            <label key={field.id}>
              <span>{localize(field.label, locale)}</span>
              <ToolFieldInput
                field={field}
                locale={locale}
                value={values[field.id] ?? field.defaultValue}
                onChange={(value) => onChange(field.id, value)}
              />
            </label>
          ))}
        </div>
      ) : null}
      {checks.length > 0 ? (
        <div className="tool-options">
          {checks.map((field) => (
            <label key={field.id}>
              <input
                type="checkbox"
                checked={values[field.id] === true}
                onChange={(event) =>
                  onChange(field.id, event.currentTarget.checked)
                }
              />
              <span>{localize(field.label, locale)}</span>
            </label>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ToolFieldInput({
  field,
  locale,
  value,
  onChange,
}: {
  field: ToolFormField;
  locale: string;
  value: ToolValues[string];
  onChange: (value: ToolValues[string]) => void;
}) {
  const shown = String(value);
  if (field.type === "select") {
    return (
      <select
        value={shown}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {localize(option.label, locale)}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "lines") {
    return (
      <textarea
        value={shown}
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={shown}
        // An emptied box stays empty while typing; the module decides what it means.
        onChange={(event) => {
          const raw = event.currentTarget.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
      />
    );
  }
  return (
    <input
      value={shown}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function ToolOverview({ tab }: { tab: ToolOutputTab }) {
  return (
    <div className="tool-overview">
      {tab.metrics.length > 0 ? (
        <div className="tool-summary-grid">
          {tab.metrics.map((metric) => (
            <div key={metric.label}>
              <small>{metric.label}</small>
              <strong title={metric.value}>{metric.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {tab.steps.length > 0 ? (
        <div className="tool-task-list">
          {tab.steps.map((step) => (
            <div className={`tool-task ${step.level}`} key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
      {tab.notes.map((note) => (
        <div
          className={`tool-notes${note.warning ? " warning" : ""}`}
          key={note.title}
        >
          <strong>{note.title}</strong>
          <ul>
            {note.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
