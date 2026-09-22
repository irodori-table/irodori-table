import type { Translator } from "@/i18n";
import {
  connectorAuthMethodPatch,
  connectorControlOptionKeys,
} from "../connector-connection-values";
import {
  connectorChoiceLabel,
  type ConnectorFormModel,
} from "../connector-form-model";
import type { ConnectionDraft } from "../connection-profiles";
import { ConnectorFieldInput } from "./ConnectorFieldInput";

type ConnectorDeclaredSectionsProps = {
  draft: ConnectionDraft;
  form: ConnectorFormModel;
  t: Translator["t"];
  onUpdateDraft: (patch: Partial<ConnectionDraft>) => void;
};

/**
 * The fieldsets a connector extension contributes to the form: its endpoint
 * modes and extra fields, supplemental profile fields, the authentication
 * method picker with that method's fields, and TLS. Renders nothing for a
 * built-in engine.
 */
export function ConnectorDeclaredSections({
  draft,
  form,
  t,
  onUpdateDraft,
}: ConnectorDeclaredSectionsProps) {
  const { connectionModel } = form;
  if (!connectionModel) {
    return null;
  }
  const setControlOption = (key: string, value: string) =>
    onUpdateDraft({ options: { ...draft.options, [key]: value } });
  const fieldInput = (field: ConnectorFormModel["authFields"][number]) => (
    <ConnectorFieldInput
      key={field.id}
      field={field}
      draft={draft}
      t={t}
      onUpdateDraft={onUpdateDraft}
    />
  );

  return (
    <>
      {form.endpointModes.length > 0 || form.endpointExtraFields.length > 0 ? (
        <fieldset className="connector-declared-section full-row">
          <legend>{t("connection.extension.endpoint")}</legend>
          <small className="connector-declared-source">
            {t("connection.extension.providedByExtension")}
          </small>
          {form.endpointModes.length > 0 ? (
            <label className="connector-declared-mode">
              <span>{t("connection.extension.endpointMode")}</span>
              {form.endpointModes.length > 1 ? (
                <select
                  value={form.endpointMode ?? ""}
                  onChange={(event) =>
                    setControlOption(
                      connectorControlOptionKeys.endpointMode,
                      event.currentTarget.value,
                    )
                  }
                >
                  {form.endpointModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {connectorChoiceLabel(mode)}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{connectorChoiceLabel(form.endpointModes[0])}</strong>
              )}
            </label>
          ) : null}
          {form.endpointExtraFields.length > 0 ? (
            <div className="connection-form-grid">
              {form.endpointExtraFields.map(fieldInput)}
            </div>
          ) : null}
        </fieldset>
      ) : null}
      {form.supplementalProfileFields.length > 0 ? (
        <fieldset className="connector-declared-section full-row">
          <legend>{t("connection.extension.profile")}</legend>
          <small className="connector-declared-source">
            {t("connection.extension.providedByExtension")}
          </small>
          <div className="connection-form-grid connector-profile-fields">
            {form.supplementalProfileFields.map(fieldInput)}
          </div>
        </fieldset>
      ) : null}
      {form.compatibleAuthMethods.length > 0 ? (
        <fieldset className="connector-declared-section full-row">
          <legend>{t("connection.extension.authentication")}</legend>
          <label className="connector-declared-mode">
            <span>{t("connection.extension.authMethod")}</span>
            <select
              value={form.selectedAuthMethod?.id ?? ""}
              onChange={(event) =>
                onUpdateDraft(
                  connectorAuthMethodPatch(
                    connectionModel,
                    draft,
                    event.currentTarget.value,
                  ),
                )
              }
            >
              {form.compatibleAuthMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
          {form.authFields.length > 0 ? (
            <div className="connection-form-grid connector-auth-fields">
              {form.authFields.map(fieldInput)}
            </div>
          ) : null}
        </fieldset>
      ) : null}
      {connectionModel.tls.supported &&
      (connectionModel.tls.modes.length > 0 || form.tlsFields.length > 0) ? (
        <fieldset className="connector-declared-section full-row">
          <legend>{t("connection.extension.tls")}</legend>
          {connectionModel.tls.modes.length > 0 ? (
            <label className="connector-declared-mode">
              <span>{t("connection.extension.tlsMode")}</span>
              <select
                value={form.tlsMode ?? ""}
                onChange={(event) =>
                  setControlOption(
                    connectorControlOptionKeys.tlsMode,
                    event.currentTarget.value,
                  )
                }
              >
                {connectionModel.tls.modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {connectorChoiceLabel(mode)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {form.tlsMode !== "disable" && form.tlsFields.length > 0 ? (
            <div className="connection-form-grid connector-tls-fields">
              {form.tlsFields.map(fieldInput)}
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </>
  );
}
