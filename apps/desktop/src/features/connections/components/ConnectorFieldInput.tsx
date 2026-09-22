import type { Translator } from "@/i18n";
import {
  isConnectorSecretField,
  type ConnectorConnectionField,
} from "@/features/extensions/connection-model";
import {
  connectorFieldDraftPatch,
  connectorFieldValue,
} from "../connector-connection-values";
import type { ConnectionDraft } from "../connection-profiles";

/** One input for a field a connector declared, typed and stored the way it asked. */
export function ConnectorFieldInput({
  field,
  draft,
  t,
  onUpdateDraft,
}: {
  field: ConnectorConnectionField;
  draft: ConnectionDraft;
  t: Translator["t"];
  onUpdateDraft: (patch: Partial<ConnectionDraft>) => void;
}) {
  const value = connectorFieldValue(draft, field);
  const secret = isConnectorSecretField(field);
  const wide = ["json", "map", "pem"].includes(field.type);
  const label = (
    <span className="connector-field-label">
      <span>
        {field.label}
        {field.required ? <i aria-hidden="true"> *</i> : null}
      </span>
      {secret ? <small>{t("connection.extension.sessionOnly")}</small> : null}
    </span>
  );
  const update = (nextValue: string) =>
    onUpdateDraft(connectorFieldDraftPatch(draft, field, nextValue));

  if (field.type === "boolean") {
    return (
      <label className="connector-declared-checkbox">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(event) => update(String(event.currentTarget.checked))}
        />
        {label}
      </label>
    );
  }

  return (
    <label className={wide ? "connector-declared-field-wide" : undefined}>
      {label}
      {wide ? (
        <textarea
          rows={field.type === "pem" ? 4 : 3}
          value={value}
          required={field.required}
          maxLength={65_536}
          spellCheck={false}
          autoComplete={secret ? "new-password" : "off"}
          onChange={(event) => update(event.currentTarget.value)}
        />
      ) : (
        <input
          type={secret ? "password" : "text"}
          inputMode={field.type === "number" ? "numeric" : undefined}
          value={value}
          required={field.required}
          maxLength={4096}
          spellCheck={false}
          autoComplete={secret ? "new-password" : "off"}
          onChange={(event) => update(event.currentTarget.value)}
        />
      )}
    </label>
  );
}
