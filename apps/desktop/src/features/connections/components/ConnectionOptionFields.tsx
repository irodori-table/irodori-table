import type { Translator } from "@/i18n";
import type { ConnectionDraft } from "../connection-profiles";
import type { EngineOptionField } from "../engine-connection-settings";

/**
 * The built-in per-engine option fields (SSL mode, warehouse, region, …).
 * Connector settings ride along in profile.options; the Rust side forwards
 * the whole map to the connector untouched.
 */
export function ConnectionOptionFields({
  fields,
  draft,
  t,
  onUpdateDraft,
}: {
  fields: EngineOptionField[];
  draft: ConnectionDraft;
  t: Translator["t"];
  onUpdateDraft: (patch: Partial<ConnectionDraft>) => void;
}) {
  if (fields.length === 0) {
    return null;
  }
  const updateOption = (key: string, value: string) =>
    onUpdateDraft({ options: { ...draft.options, [key]: value } });

  return (
    <div className="connection-form-stack connector-options full-row">
      <span className="connector-options-label">
        {t("connection.connectorSettings")}
      </span>
      <div className="connection-form-grid">
        {fields.map((field) => (
          <label key={field.key}>
            <span>{t(field.labelKey)}</span>
            {field.choices ? (
              <select
                value={draft.options?.[field.key] ?? ""}
                onChange={(event) =>
                  updateOption(field.key, event.currentTarget.value)
                }
              >
                <option value="">{t("connection.option.driverDefault")}</option>
                {field.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft.options?.[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(event) =>
                  updateOption(field.key, event.currentTarget.value)
                }
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
