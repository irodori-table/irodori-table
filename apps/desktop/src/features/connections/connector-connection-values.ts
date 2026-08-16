import type { ConnectionDraft } from "@/lib/workspace-connection";
import {
  connectorControlOptionKeys,
  connectorFieldOptionKey,
  isConnectorSecretField,
  type ConnectorAuthMethod,
  type ConnectorConnectionField,
  type ConnectorConnectionModel,
  type ConnectorProfileField,
} from "@/features/extensions/connection-model";

export { connectorControlOptionKeys };

const customOptionKey = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const blockedCustomOptionKeys = new Set([
  "constructor",
  "prototype",
  "__proto__",
  ...Object.values(connectorControlOptionKeys).map((key) => key.toLowerCase()),
]);
const maxCustomOptionsLength = 32_768;
const maxCustomOptionCount = 64;

export type ParsedCustomConnectorOptions = {
  options: Record<string, string>;
  error: string | null;
};

/** Parse the model's free-form options field without trusting object keys. */
export function parseCustomConnectorOptions(
  raw: string,
): ParsedCustomConnectorOptions {
  const text = raw.trim();
  if (!text) {
    return { options: {}, error: null };
  }
  if (text.length > maxCustomOptionsLength) {
    return { options: {}, error: "driver options are too large" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { options: {}, error: "driver options must be valid JSON" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { options: {}, error: "driver options must be a JSON object" };
  }
  const entries = Object.entries(value);
  if (entries.length > maxCustomOptionCount) {
    return {
      options: {},
      error: `driver options can contain at most ${maxCustomOptionCount} keys`,
    };
  }
  const options: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (!customOptionKey.test(key)) {
      return { options: {}, error: "driver option keys are not allowed" };
    }
    if (blockedCustomOptionKeys.has(key.toLowerCase())) {
      return { options: {}, error: `driver option key ${key} is not allowed` };
    }
    if (
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      return {
        options: {},
        error: `driver option ${key} must be a string, number, or boolean`,
      };
    }
    if (typeof item === "number" && !Number.isFinite(item)) {
      return { options: {}, error: `driver option ${key} must be finite` };
    }
    const scalar = String(item);
    if (scalar.length > 4096) {
      return { options: {}, error: `driver option ${key} is too large` };
    }
    options[key] = scalar;
  }
  return { options, error: null };
}

function profileValue(
  draft: ConnectionDraft,
  field: ConnectorProfileField,
): string {
  switch (field) {
    case "id":
    case "url":
    case "host":
    case "port":
    case "user":
    case "password":
    case "database":
    case "socketPath":
      return draft[field];
    case "readOnly":
      return String(draft.readOnly);
    case "options":
      return draft.customOptionsJson ?? "";
  }
}

export function connectorFieldValue(
  draft: ConnectionDraft,
  field: ConnectorConnectionField,
): string {
  const bound = field.profileField
    ? profileValue(draft, field.profileField)
    : "";
  if (bound) {
    return bound;
  }
  const key = connectorFieldOptionKey(field);
  if (key) {
    const stored = isConnectorSecretField(field)
      ? draft.secretOptions?.[key]
      : draft.options?.[key];
    if (stored !== undefined) {
      return stored;
    }
  }
  return field.defaultValue ?? "";
}

export function connectorFieldDraftPatch(
  draft: ConnectionDraft,
  field: ConnectorConnectionField,
  value: string,
): Partial<ConnectionDraft> {
  const profileField = field.profileField;
  if (
    profileField &&
    profileField !== "id" &&
    profileField !== "options" &&
    profileField !== "readOnly"
  ) {
    return { [profileField]: value } as Partial<ConnectionDraft>;
  }
  if (profileField === "readOnly") {
    return { readOnly: value === "true" };
  }
  if (profileField === "options") {
    return { customOptionsJson: value };
  }
  const key = connectorFieldOptionKey(field);
  if (!key) {
    return {};
  }
  if (isConnectorSecretField(field)) {
    return { secretOptions: { ...draft.secretOptions, [key]: value } };
  }
  return { options: { ...draft.options, [key]: value } };
}

function methodHasProfileField(
  method: ConnectorAuthMethod,
  profileField: ConnectorProfileField,
): boolean {
  return method.fields.some((field) => field.profileField === profileField);
}

export function selectedConnectorAuthMethod(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
): ConnectorAuthMethod | null {
  const selected = draft.options?.[connectorControlOptionKeys.authMethod];
  const selectedMethod = model.authMethods.find(
    (method) => method.id === selected,
  );
  // A saved connection-string choice is incompatible with the structured
  // fields form. Ignore it after a mode switch instead of validating a hidden
  // URL field or sending an auth method without its declared value.
  if (
    selectedMethod &&
    !(draft.mode === "fields" && selectedMethod.kind === "connectionString")
  ) {
    return selectedMethod;
  }
  if (draft.mode === "url") {
    const connectionString = model.authMethods.find(
      (method) => method.kind === "connectionString",
    );
    if (connectionString) {
      return connectionString;
    }
  }
  if (draft.password || draft.user) {
    const profileCredentials = model.authMethods.find(
      (method) =>
        methodHasProfileField(method, "password") ||
        methodHasProfileField(method, "user"),
    );
    if (profileCredentials) {
      return profileCredentials;
    }
  }
  // The SDK preserves declaration order and provides no separate default-auth
  // property. Use the first method compatible with this form mode; connectors
  // conventionally declare `none` first when anonymous/default-chain access is
  // available, which avoids selecting a credential type the user never chose.
  return (
    model.authMethods.find(
      (method) => draft.mode !== "fields" || method.kind !== "connectionString",
    ) ?? null
  );
}

export function selectedConnectorEndpointMode(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
): string | null {
  const compatibleModes = model.endpoint.modes.filter((mode) =>
    draft.mode === "url"
      ? mode === "connectionString"
      : mode !== "connectionString",
  );
  const selected = draft.options?.[connectorControlOptionKeys.endpointMode];
  if (selected && compatibleModes.includes(selected)) {
    return selected;
  }
  return compatibleModes[0] ?? null;
}

export function selectedConnectorTlsMode(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
): string | null {
  if (!model.tls.supported || model.tls.modes.length === 0) {
    return null;
  }
  const selected = draft.options?.[connectorControlOptionKeys.tlsMode];
  if (selected && model.tls.modes.includes(selected)) {
    return selected;
  }
  if (model.tls.requiredByDefault && model.tls.modes.includes("require")) {
    return "require";
  }
  if (model.tls.modes.includes("prefer")) {
    return "prefer";
  }
  return model.tls.modes[0] ?? null;
}

export function resolvedConnectorProfileValue(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
  profileField: ConnectorProfileField,
): string {
  const authFields = selectedConnectorAuthMethod(model, draft)?.fields ?? [];
  const field = [
    ...authFields,
    ...model.endpoint.fields,
    ...model.profileFields,
    ...model.tls.fields,
  ].find((candidate) => candidate.profileField === profileField);
  const resolved = field
    ? connectorFieldValue(draft, field)
    : profileValue(draft, profileField);
  if (
    profileField === "port" &&
    !resolved &&
    model.endpoint.defaultPort &&
    model.endpoint.defaultPort > 0
  ) {
    return String(model.endpoint.defaultPort);
  }
  return resolved;
}

function addFieldOption(
  options: Record<string, string>,
  draft: ConnectionDraft,
  field: ConnectorConnectionField,
) {
  const key = connectorFieldOptionKey(field);
  const value = connectorFieldValue(draft, field).trim();
  if (key && value) {
    options[key] = value;
  }
}

function addDeclaredFieldOptions(
  options: Record<string, string>,
  draft: ConnectionDraft,
  fields: readonly ConnectorConnectionField[],
) {
  for (const field of fields) {
    if (field.profileField === "options") {
      Object.assign(
        options,
        parseCustomConnectorOptions(draft.customOptionsJson ?? "").options,
      );
    } else {
      addFieldOption(options, draft, field);
    }
  }
}

function fieldsShareBinding(
  left: ConnectorConnectionField,
  right: ConnectorConnectionField,
): boolean {
  if (left.id === right.id) {
    return true;
  }
  if (
    left.profileField &&
    right.profileField &&
    left.profileField === right.profileField
  ) {
    return true;
  }
  const leftOption = connectorFieldOptionKey(left);
  const rightOption = connectorFieldOptionKey(right);
  return Boolean(leftOption && rightOption && leftOption === rightOption);
}

const profileFieldsHandledByCore = new Set<ConnectorProfileField>([
  "id",
  "url",
  "host",
  "port",
  "database",
  "socketPath",
  "readOnly",
]);
const authenticationProfileFields = new Set<ConnectorProfileField>([
  "user",
  "password",
]);

/**
 * Profile fields are a superset of the endpoint/auth/TLS declarations in the
 * current SDK manifests. Return only fields that are not already represented
 * by one of those sections or by a first-class connection control.
 */
export function supplementalConnectorProfileFields(
  model: ConnectorConnectionModel,
): ConnectorConnectionField[] {
  const sectionFields = [
    ...model.endpoint.fields,
    ...model.authMethods.flatMap((method) => method.fields),
    ...model.tls.fields,
  ];
  return model.profileFields.filter(
    (field) =>
      !(
        field.profileField && profileFieldsHandledByCore.has(field.profileField)
      ) &&
      !(
        model.authMethods.length > 0 &&
        field.profileField &&
        authenticationProfileFields.has(field.profileField)
      ) &&
      !sectionFields.some((sectionField) =>
        fieldsShareBinding(field, sectionField),
      ),
  );
}

/**
 * Resolve the connector-declared values sent for this one connection attempt.
 * Secret fields come from `secretOptions`, which never enters persistence.
 */
export function connectorRequestOptions(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
): Record<string, string> {
  const options: Record<string, string> = {};
  const endpointMode = selectedConnectorEndpointMode(model, draft);
  if (endpointMode) {
    options[connectorControlOptionKeys.endpointMode] = endpointMode;
  }
  if (draft.mode === "fields") {
    addDeclaredFieldOptions(options, draft, model.endpoint.fields);
  }

  addDeclaredFieldOptions(
    options,
    draft,
    supplementalConnectorProfileFields(model),
  );

  const authMethod = selectedConnectorAuthMethod(model, draft);
  if (authMethod) {
    options[connectorControlOptionKeys.authMethod] = authMethod.id;
    addDeclaredFieldOptions(options, draft, authMethod.fields);
  }

  const tlsMode = selectedConnectorTlsMode(model, draft);
  if (tlsMode) {
    options[connectorControlOptionKeys.tlsMode] = tlsMode;
  }
  if (model.tls.supported && tlsMode !== "disable") {
    addDeclaredFieldOptions(options, draft, model.tls.fields);
  }
  return options;
}

function requiredFieldError(
  fields: readonly ConnectorConnectionField[],
  draft: ConnectionDraft,
): string | null {
  for (const field of fields) {
    if (field.required && !connectorFieldValue(draft, field).trim()) {
      return `${field.label.toLowerCase()} is required`;
    }
  }
  return null;
}

function typedFieldError(
  fields: readonly ConnectorConnectionField[],
  draft: ConnectionDraft,
): string | null {
  for (const field of fields) {
    const value = connectorFieldValue(draft, field).trim();
    if (!value) {
      continue;
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) {
      return `${field.label.toLowerCase()} must be a number`;
    }
    if (field.type === "json") {
      try {
        JSON.parse(value);
      } catch {
        return `${field.label.toLowerCase()} must be valid JSON`;
      }
    }
  }
  return null;
}

function validateFields(
  fields: readonly ConnectorConnectionField[],
  draft: ConnectionDraft,
): string | null {
  return requiredFieldError(fields, draft) ?? typedFieldError(fields, draft);
}

export function validateConnectorConnectionDraft(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
): string | null {
  if (draft.mode === "fields") {
    const endpointError = validateFields(model.endpoint.fields, draft);
    if (endpointError) {
      return endpointError;
    }
  }
  const profileFields = supplementalConnectorProfileFields(model);
  const profileError = validateFields(profileFields, draft);
  if (profileError) {
    return profileError;
  }
  const authMethod = selectedConnectorAuthMethod(model, draft);
  const authError = validateFields(authMethod?.fields ?? [], draft);
  if (authError) {
    return authError;
  }
  const activeFields = [
    ...(draft.mode === "fields" ? model.endpoint.fields : []),
    ...profileFields,
    ...(authMethod?.fields ?? []),
    ...(model.tls.supported &&
    selectedConnectorTlsMode(model, draft) !== "disable"
      ? model.tls.fields
      : []),
  ];
  if (activeFields.some((field) => field.profileField === "options")) {
    const customOptions = parseCustomConnectorOptions(
      draft.customOptionsJson ?? "",
    );
    if (customOptions.error) {
      return customOptions.error;
    }
  }
  if (
    model.tls.supported &&
    selectedConnectorTlsMode(model, draft) !== "disable"
  ) {
    return validateFields(model.tls.fields, draft);
  }
  return null;
}

export function connectorAuthMethodPatch(
  model: ConnectorConnectionModel,
  draft: ConnectionDraft,
  authMethod: string,
): Partial<ConnectionDraft> {
  const previousMethod = selectedConnectorAuthMethod(model, draft);
  const nextMethod = model.authMethods.find(
    (method) => method.id === authMethod,
  );
  const leavingConnectionString =
    previousMethod?.kind === "connectionString" &&
    nextMethod?.kind !== "connectionString";
  const options = {
    ...draft.options,
    [connectorControlOptionKeys.authMethod]: authMethod,
  };
  const secretOptions = { ...draft.secretOptions };
  for (const method of model.authMethods) {
    for (const field of method.fields) {
      if (!isConnectorSecretField(field)) {
        continue;
      }
      const key = connectorFieldOptionKey(field);
      if (key) {
        delete secretOptions[key];
      }
    }
  }
  return {
    options,
    secretOptions,
    ...(draft.customOptionsJson === undefined ? {} : { customOptionsJson: "" }),
    // The legacy password slot may contain a credential from the previous
    // method even when this connector has no password-bound method at all.
    password: "",
    ...(leavingConnectionString ? { mode: "fields", url: "" } : {}),
    ...(nextMethod?.kind === "connectionString" ? { mode: "url" } : {}),
  };
}

export function authMethodUsesProfileField(
  method: ConnectorAuthMethod | null,
  profileField: ConnectorProfileField,
): boolean {
  return method ? methodHasProfileField(method, profileField) : false;
}
