import { isRecord } from "@/core";
import type { DbEngine, InstalledExtension } from "@/generated/irodori-api";

const safeIdentifier = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const blockedIdentifiers = new Set(["constructor", "prototype", "__proto__"]);
const maxFields = 64;
const maxMethods = 64;
const maxModes = 32;

// Must mirror DbEngine::connector_extension_id in src-tauri/db/engine.rs. An
// installed connector with the same engine but a different id is not the code
// path connect_engine will call. Built-in engines stay on the static form
// because the current connect_engine does not dispatch their catalog package.
const connectorExtensionIds: Partial<Record<DbEngine, string>> = {
  duckdb: "irodori.duckdb",
  motherduck: "irodori.motherduck",
  memgraph: "irodori.memgraph",
  qdrant: "irodori.qdrant",
  milvus: "irodori.milvus",
  pinecone: "irodori.pinecone",
  trinoPresto: "irodori.trino-presto",
  firebird: "irodori.firebird",
  databricks: "irodori.databricks",
  elasticsearch: "irodori.elasticsearch",
  openSearch: "irodori.opensearch",
  couchbase: "irodori.couchbase",
  dynamodb: "irodori.dynamodb",
  cloudSpanner: "irodori.cloud-spanner",
  arangodb: "irodori.arangodb",
  iotdb: "irodori.iotdb",
  hive: "irodori.hive",
  athena: "irodori.athena",
  iceberg: "irodori.iceberg",
  s3Tables: "irodori.s3-tables",
  deltaLake: "irodori.delta-lake",
  hudi: "irodori.hudi",
};

export const connectorControlOptionKeys = {
  authMethod: "authMethod",
  endpointMode: "endpointMode",
  tlsMode: "tlsMode",
} as const;

const reservedConnectorOptionKeys = new Set(
  Object.values(connectorControlOptionKeys).map((key) => key.toLowerCase()),
);

export const connectorProfileFields = [
  "id",
  "url",
  "host",
  "port",
  "user",
  "password",
  "database",
  "socketPath",
  "readOnly",
  "options",
] as const;

export type ConnectorProfileField = (typeof connectorProfileFields)[number];

export type ConnectorConnectionField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  profileField?: ConnectorProfileField;
  option?: string;
  secretPurpose?: string;
};

export type ConnectorAuthMethod = {
  id: string;
  label: string;
  kind: string;
  fields: ConnectorConnectionField[];
};

export type ConnectorEndpointModel = {
  modes: string[];
  defaultPort?: number;
  fields: ConnectorConnectionField[];
};

export type ConnectorTlsModel = {
  supported: boolean;
  requiredByDefault: boolean;
  modes: string[];
  fields: ConnectorConnectionField[];
};

export type ConnectorConnectionModel = {
  schemaVersion: 1;
  endpoint: ConnectorEndpointModel;
  profileFields: ConnectorConnectionField[];
  authMethods: ConnectorAuthMethod[];
  tls: ConnectorTlsModel;
};

function safeString(value: unknown, maxLength = 256): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function identifier(value: unknown): string | null {
  const text = safeString(value, 128);
  return text &&
    safeIdentifier.test(text) &&
    !blockedIdentifiers.has(text.toLowerCase())
    ? text
    : null;
}

function scalarDefault(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.slice(0, 4096);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function profileField(value: unknown): ConnectorProfileField | undefined {
  return connectorProfileFields.includes(value as ConnectorProfileField)
    ? (value as ConnectorProfileField)
    : undefined;
}

function connectionField(value: unknown): ConnectorConnectionField | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = identifier(value.id);
  const label = safeString(value.label);
  const type = identifier(value.type);
  if (!id || !label || !type) {
    return null;
  }
  const declaredProfileField = profileField(value.profileField);
  const optionCandidate = identifier(value.option);
  const option =
    optionCandidate &&
    !reservedConnectorOptionKeys.has(optionCandidate.toLowerCase())
      ? optionCandidate
      : null;
  const secretPurpose = identifier(value.secretPurpose);
  const defaultValue = scalarDefault(value.default);
  const secret = type === "secret" || Boolean(secretPurpose);
  // Only the legacy password slot is guaranteed to be transient. A connector
  // must not be able to label a persisted field (database, host, user, …) as a
  // secret and make the UI promise that it will not be saved.
  const safeProfileField =
    secret && declaredProfileField !== "password"
      ? undefined
      : declaredProfileField;
  if (
    reservedConnectorOptionKeys.has(id.toLowerCase()) &&
    !safeProfileField &&
    !option
  ) {
    return null;
  }
  return {
    id,
    label,
    type,
    required: value.required === true,
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(safeProfileField ? { profileField: safeProfileField } : {}),
    ...(option ? { option } : {}),
    ...(secretPurpose ? { secretPurpose } : {}),
  };
}

function fields(value: unknown): ConnectorConnectionField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ConnectorConnectionField[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, maxFields)) {
    const field = connectionField(item);
    if (!field || seen.has(field.id)) {
      continue;
    }
    seen.add(field.id);
    result.push(field);
  }
  return result;
}

function modes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const item of value.slice(0, maxModes)) {
    const mode = identifier(item);
    if (mode && !result.includes(mode)) {
      result.push(mode);
    }
  }
  return result;
}

function endpoint(value: unknown): ConnectorEndpointModel {
  if (!isRecord(value)) {
    return { modes: [], fields: [] };
  }
  const defaultPort =
    typeof value.defaultPort === "number" &&
    Number.isInteger(value.defaultPort) &&
    value.defaultPort >= 0 &&
    value.defaultPort <= 65_535
      ? value.defaultPort
      : undefined;
  return {
    modes: modes(value.modes),
    ...(defaultPort === undefined ? {} : { defaultPort }),
    fields: fields(value.fields),
  };
}

function authMethods(value: unknown): ConnectorAuthMethod[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ConnectorAuthMethod[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, maxMethods)) {
    if (!isRecord(item)) {
      continue;
    }
    const id = identifier(item.id);
    const label = safeString(item.label);
    const kind = identifier(item.kind);
    if (!id || !label || !kind || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({ id, label, kind, fields: fields(item.fields) });
  }
  return result;
}

function tls(value: unknown): ConnectorTlsModel {
  if (!isRecord(value)) {
    return {
      supported: false,
      requiredByDefault: false,
      modes: [],
      fields: [],
    };
  }
  return {
    supported: value.supported === true,
    requiredByDefault: value.requiredByDefault === true,
    modes: modes(value.modes),
    fields: fields(value.fields),
  };
}

/**
 * Decode the untrusted, forward-compatible model retained by the native
 * extension host. Schema versions the UI does not understand deliberately
 * return null so the existing built-in form stays available.
 */
export function parseConnectorConnectionModel(
  value: unknown,
): ConnectorConnectionModel | null {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }
  const model: ConnectorConnectionModel = {
    schemaVersion: 1,
    endpoint: endpoint(value.endpoint),
    profileFields: fields(value.profileFields),
    authMethods: authMethods(value.authMethods),
    tls: tls(value.tls),
  };
  const usable =
    model.endpoint.modes.length > 0 ||
    model.endpoint.fields.length > 0 ||
    model.profileFields.length > 0 ||
    model.authMethods.length > 0 ||
    model.tls.supported ||
    model.tls.modes.length > 0 ||
    model.tls.fields.length > 0;
  return usable ? model : null;
}

export function connectionModelForEngine(
  extensions: readonly InstalledExtension[],
  engine: DbEngine,
): ConnectorConnectionModel | null {
  const expectedExtensionId = connectorExtensionIds[engine];
  if (!expectedExtensionId) {
    return null;
  }
  for (const extension of extensions) {
    if (
      !extension.enabled ||
      extension.runtime !== "native" ||
      extension.id !== expectedExtensionId ||
      extension.engine !== engine
    ) {
      continue;
    }
    const model = parseConnectorConnectionModel(extension.connectionModel);
    if (model) {
      return model;
    }
  }
  return null;
}

export function isConnectorSecretField(
  field: ConnectorConnectionField,
): boolean {
  // A free-form options map can carry connector-specific credentials whose
  // names are not knowable to the host. Treat the entire editor as transient
  // rather than risking persistence through ConnectionDraft.options.
  return (
    field.type === "secret" ||
    Boolean(field.secretPurpose) ||
    field.profileField === "password" ||
    field.profileField === "options"
  );
}

/** The options-map key a non-profile field contributes to the request. */
export function connectorFieldOptionKey(
  field: ConnectorConnectionField,
): string | null {
  if (field.option) {
    return field.option;
  }
  if (field.profileField) {
    return null;
  }
  return field.id;
}
