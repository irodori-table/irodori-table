/**
 * What the connection form shows for the current draft, resolved once from
 * the connector's declared connection model.
 *
 * The dialog used to compute all of this inline, which tied the "which fields
 * belong to which section" rules to the component that rendered them. This
 * module is pure so those rules can be tested without mounting the form, and
 * so the endpoint, authentication, TLS, and option sections can each render
 * from one shared resolution instead of re-deriving overlapping sets.
 */

import {
  connectorFieldOptionKey,
  connectorSupportsFieldsInput,
  connectorSupportsUrlInput,
  type ConnectorAuthMethod,
  type ConnectorConnectionField,
  type ConnectorConnectionModel,
  type ConnectorProfileField,
} from "@/features/extensions/connection-model";
import {
  selectedConnectorAuthMethod,
  selectedConnectorEndpointMode,
  selectedConnectorTlsMode,
  supplementalConnectorProfileFields,
} from "./connector-connection-values";
import type { ConnectionDraft } from "./connection-profiles";
import type { EngineOptionField } from "./engine-connection-settings";

export type ConnectorFormModel = {
  /** The connector's declared model, or null for a built-in engine. */
  connectionModel: ConnectorConnectionModel | null;
  supportsUrlInput: boolean;
  supportsFieldsInput: boolean;
  /** The connector declares endpoint modes or fields, so they replace the built-in host/port layout. */
  usesDeclaredEndpoint: boolean;
  /** Declared fields that stand in for the built-in url/host/port/database inputs. */
  urlField: ConnectorConnectionField | undefined;
  hostField: ConnectorConnectionField | undefined;
  portField: ConnectorConnectionField | undefined;
  databaseField: ConnectorConnectionField | undefined;
  endpointMode: string | null;
  /** Endpoint modes compatible with the draft's input mode. */
  endpointModes: string[];
  /** Declared endpoint fields with no built-in counterpart. */
  endpointExtraFields: ConnectorConnectionField[];
  supplementalProfileFields: ConnectorConnectionField[];
  selectedAuthMethod: ConnectorAuthMethod | null;
  /** Auth methods compatible with the draft's input mode. */
  compatibleAuthMethods: ConnectorAuthMethod[];
  /** Fields of the selected auth method that are not already collected by the endpoint section. */
  authFields: ConnectorConnectionField[];
  tlsMode: string | null;
  /** Declared TLS fields not already collected by the auth section. */
  tlsFields: ConnectorConnectionField[];
  /** Built-in option fields the connector has not declared itself. */
  visibleOptionFields: EngineOptionField[];
};

function optionKeys(fields: ConnectorConnectionField[]) {
  return new Set(
    fields
      .map(connectorFieldOptionKey)
      .filter((key): key is string => Boolean(key)),
  );
}

export function resolveConnectorFormModel(
  connectionModel: ConnectorConnectionModel | null,
  draft: ConnectionDraft,
  optionFields: EngineOptionField[],
): ConnectorFormModel {
  if (!connectionModel) {
    return {
      connectionModel: null,
      supportsUrlInput: true,
      supportsFieldsInput: true,
      usesDeclaredEndpoint: false,
      urlField: undefined,
      hostField: undefined,
      portField: undefined,
      databaseField: undefined,
      endpointMode: null,
      endpointModes: [],
      endpointExtraFields: [],
      supplementalProfileFields: [],
      selectedAuthMethod: null,
      compatibleAuthMethods: [],
      authFields: [],
      tlsMode: null,
      tlsFields: [],
      visibleOptionFields: optionFields,
    };
  }

  const declaredEndpointFields = connectionModel.endpoint.fields;
  const selectedAuthMethod = selectedConnectorAuthMethod(
    connectionModel,
    draft,
  );
  const declaredProfileField = (profileField: ConnectorProfileField) =>
    selectedAuthMethod?.fields.find(
      (field) => field.profileField === profileField,
    ) ??
    declaredEndpointFields.find(
      (field) => field.profileField === profileField,
    ) ??
    connectionModel.profileFields.find(
      (field) => field.profileField === profileField,
    );

  const endpointOptionKeys = optionKeys(declaredEndpointFields);
  // Auth fields that map onto a profile column other than user/password/options
  // are already collected as that column; the rest are auth-specific inputs,
  // minus anything the endpoint section shows under the same option key.
  const authFields = (selectedAuthMethod?.fields ?? []).filter((field) => {
    if (
      field.profileField &&
      field.profileField !== "user" &&
      field.profileField !== "password" &&
      field.profileField !== "options"
    ) {
      return false;
    }
    const key = connectorFieldOptionKey(field);
    return !key || !endpointOptionKeys.has(key);
  });
  const authFieldKeys = new Set(
    authFields
      .map((field) => connectorFieldOptionKey(field) ?? field.id)
      .filter(Boolean),
  );
  const declaredTlsFields = connectionModel.tls.supported
    ? connectionModel.tls.fields
    : [];
  const declaredFieldKeys = optionKeys([
    ...declaredEndpointFields,
    ...connectionModel.profileFields,
    ...connectionModel.authMethods.flatMap((method) => method.fields),
    ...declaredTlsFields,
  ]);

  return {
    connectionModel,
    supportsUrlInput: connectorSupportsUrlInput(connectionModel),
    supportsFieldsInput: connectorSupportsFieldsInput(connectionModel),
    usesDeclaredEndpoint:
      declaredEndpointFields.length > 0 ||
      connectionModel.endpoint.modes.length > 0,
    urlField: declaredProfileField("url"),
    hostField: declaredProfileField("host"),
    portField: declaredProfileField("port"),
    databaseField: declaredProfileField("database"),
    endpointMode: selectedConnectorEndpointMode(connectionModel, draft),
    endpointModes: connectionModel.endpoint.modes.filter((mode) =>
      draft.mode === "url"
        ? mode === "connectionString"
        : mode !== "connectionString",
    ),
    endpointExtraFields: declaredEndpointFields.filter(
      (field) => !field.profileField,
    ),
    supplementalProfileFields:
      supplementalConnectorProfileFields(connectionModel),
    selectedAuthMethod,
    compatibleAuthMethods: connectionModel.authMethods.filter(
      (method) => draft.mode !== "fields" || method.kind !== "connectionString",
    ),
    authFields,
    tlsMode: selectedConnectorTlsMode(connectionModel, draft),
    tlsFields: declaredTlsFields.filter(
      (field) => !authFieldKeys.has(connectorFieldOptionKey(field) ?? field.id),
    ),
    visibleOptionFields: optionFields.filter(
      (field) => !declaredFieldKeys.has(field.key),
    ),
  };
}

/** "connectionString" → "Connection string", "verify-full" → "Verify full". */
export function connectorChoiceLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}
