import { describe, expect, it } from "vitest";
import rustEngineSource from "../../../../../src-tauri/src/db/engine.rs?raw";
import bundledCatalog from "@/features/extensions/bundled-catalog.json";
import {
  connectionModelForEngine,
  connectorExtensionIdForEngine,
  connectorExtensionIds,
  connectorFieldOptionKey,
  connectorSupportsFieldsInput,
  connectorSupportsUrlInput,
  enabledConnectorEngineSet,
  extensionRequiredEngines,
  isConnectorSecretField,
  isExtensionBackedEngine,
  parseConnectorConnectionModel,
  type ConnectorConnectionField,
} from "@/features/extensions/connection-model";
import type { InstalledExtension } from "@/generated/irodori-api";

const model = {
  schemaVersion: 1,
  defaults: {
    engine: "qdrant",
    wire: "qdrant",
    port: 6333,
    readOnly: false,
  },
  endpoint: {
    modes: ["hostPort", "connectionString"],
    defaultPort: 6333,
    fields: [
      {
        id: "host",
        label: "Host",
        type: "string",
        profileField: "host",
        required: true,
      },
      {
        id: "protocol",
        label: "Protocol",
        type: "string",
        option: "protocol",
        default: "rest",
      },
    ],
  },
  profileFields: [],
  authMethods: [
    { id: "none", label: "No authentication", kind: "none", fields: [] },
    {
      id: "apiKey",
      label: "API key",
      kind: "apiKey",
      fields: [
        {
          id: "apiKey",
          label: "API key",
          type: "secret",
          secretPurpose: "token",
        },
      ],
    },
  ],
  tls: {
    supported: true,
    requiredByDefault: false,
    modes: ["disable", "verifyFull"],
    fields: [
      {
        id: "clientPrivateKey",
        label: "Client private key",
        type: "pem",
        secretPurpose: "privateKey",
      },
    ],
  },
  transports: ["direct", "sshTunnel"],
};

function installed(
  patch: Partial<InstalledExtension> = {},
): InstalledExtension {
  return {
    id: "irodori.qdrant",
    name: "Qdrant Connector",
    version: "0.1.0",
    runtime: "native",
    engine: "qdrant",
    hostFeatures: [],
    sha256: "abc",
    enabled: true,
    installedAt: "0",
    supportedCalls: ["connect"],
    connectionModel: model,
    ...patch,
  };
}

describe("connector connection model", () => {
  it("decodes the supported model without trusting arbitrary bindings", () => {
    const parsed = parseConnectorConnectionModel(model);

    expect(parsed).not.toBeNull();
    expect(parsed?.endpoint).toMatchObject({
      modes: ["hostPort", "connectionString"],
      defaultPort: 6333,
    });
    expect(parsed?.defaults).toEqual({
      engine: "qdrant",
      wire: "qdrant",
      port: 6333,
      readOnly: false,
    });
    expect(parsed?.transports).toEqual(["direct", "sshTunnel"]);
    expect(parsed?.endpoint.fields[1]).toMatchObject({
      id: "protocol",
      option: "protocol",
      defaultValue: "rest",
    });
    expect(parsed?.authMethods[1].fields[0]).toMatchObject({
      id: "apiKey",
      secretPurpose: "token",
    });
  });

  it("falls back for unknown schemas and drops unsafe field keys", () => {
    expect(
      parseConnectorConnectionModel({ ...model, schemaVersion: 2 }),
    ).toBeNull();

    const parsed = parseConnectorConnectionModel({
      ...model,
      endpoint: {
        ...model.endpoint,
        fields: [
          ...model.endpoint.fields,
          {
            id: "__proto__",
            label: "Prototype",
            type: "string",
          },
          {
            id: "constructor",
            label: "Constructor",
            type: "string",
          },
          {
            id: "safe",
            label: "Safe",
            type: "string",
            profileField: "notAProfileField",
            option: "constructor[prototype]",
          },
          {
            id: "databaseCredential",
            label: "Database credential",
            type: "secret",
            profileField: "database",
            secretPurpose: "token",
          },
          {
            id: "authMethod",
            label: "Control collision",
            type: "secret",
          },
        ],
      },
    });

    expect(parsed?.endpoint.fields.map((field) => field.id)).toEqual([
      "host",
      "protocol",
      "safe",
      "databaseCredential",
    ]);
    expect(parsed?.endpoint.fields[2].profileField).toBeUndefined();
    expect(parsed?.endpoint.fields[2].option).toBeUndefined();
    expect(parsed?.endpoint.fields[3]).toMatchObject({
      id: "databaseCredential",
      secretPurpose: "token",
    });
    expect(parsed?.endpoint.fields[3].profileField).toBeUndefined();
  });

  it("falls back instead of activating an empty schema-version shell", () => {
    expect(parseConnectorConnectionModel({ schemaVersion: 1 })).toBeNull();
    expect(
      parseConnectorConnectionModel({
        schemaVersion: 1,
        endpoint: {},
        profileFields: [],
        authMethods: [],
        tls: {},
      }),
    ).toBeNull();
  });

  it("uses only an enabled native extension for the selected engine", () => {
    expect(
      connectionModelForEngine(
        [installed({ enabled: false }), installed()],
        "qdrant",
      )?.authMethods.map((method) => method.id),
    ).toEqual(["none", "apiKey"]);
    expect(
      connectionModelForEngine(
        [installed({ runtime: "declarative" })],
        "qdrant",
      ),
    ).toBeNull();
    expect(connectionModelForEngine([installed()], "milvus")).toBeNull();
    expect(
      connectionModelForEngine(
        [installed({ id: "vendor.other-qdrant" })],
        "qdrant",
      ),
    ).toBeNull();
    expect(
      connectionModelForEngine(
        [
          installed({
            id: "irodori.snowflake",
            engine: "snowflake",
          }),
        ],
        "snowflake",
      ),
    ).toBeNull();
    expect(
      connectionModelForEngine(
        [
          installed({
            id: "irodori.snowflake",
            engine: "snowflake",
            connectionModel: {
              ...model,
              defaults: { ...model.defaults, engine: "snowflake" },
            },
          }),
        ],
        "snowflake",
      )?.defaults.engine,
    ).toBe("snowflake");
  });

  it("maps every native marketplace connector and tracks extension-only engines", () => {
    expect(connectorExtensionIdForEngine("qdrant")).toBe("irodori.qdrant");
    expect(connectorExtensionIdForEngine("snowflake")).toBe(
      "irodori.snowflake",
    );
    expect(isExtensionBackedEngine("duckdb")).toBe(true);
    expect(isExtensionBackedEngine("snowflake")).toBe(true);
    expect(isExtensionBackedEngine("postgres")).toBe(false);
    expect(extensionRequiredEngines.has("duckdb")).toBe(true);
    expect(extensionRequiredEngines.has("snowflake")).toBe(false);
    const catalogConnectorIds = Object.fromEntries(
      bundledCatalog.extensions
        .filter(
          (extension) =>
            extension.runtime === "native" &&
            extension.categories.includes("connector"),
        )
        .flatMap((extension) =>
          extension.engines.map((engine) => [engine, extension.id]),
        ),
    );
    expect(Object.keys(catalogConnectorIds)).toHaveLength(35);
    expect(connectorExtensionIds).toEqual(catalogConnectorIds);
  });

  it("reports enabled connector engines even when their model is unavailable", () => {
    expect(
      enabledConnectorEngineSet([
        installed({
          id: "irodori.mongodb",
          engine: "mongodb",
          connectionModel: undefined,
        }),
      ]),
    ).toEqual(new Set(["mongodb"]));
  });

  it("derives supported input modes from the endpoint declaration", () => {
    const both = parseConnectorConnectionModel(model);
    const fieldsOnly = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["cloudResource", "customEndpoint"],
        fields: [{ id: "environment", label: "Environment", type: "string" }],
      },
      profileFields: [],
      authMethods: [],
      tls: { supported: false, modes: [], fields: [] },
      transports: ["direct"],
    });
    const urlOnly = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: { modes: ["connectionString"], fields: [] },
      profileFields: [],
      authMethods: [],
      tls: { supported: false, modes: [], fields: [] },
      transports: ["direct"],
    });
    expect(both && connectorSupportsUrlInput(both)).toBe(true);
    expect(both && connectorSupportsFieldsInput(both)).toBe(true);
    expect(fieldsOnly && connectorSupportsUrlInput(fieldsOnly)).toBe(false);
    expect(fieldsOnly && connectorSupportsFieldsInput(fieldsOnly)).toBe(true);
    expect(urlOnly && connectorSupportsUrlInput(urlOnly)).toBe(true);
    expect(urlOnly && connectorSupportsFieldsInput(urlOnly)).toBe(false);
  });

  it("matches the Rust connector dispatch map", () => {
    const dispatch = rustEngineSource.match(
      /fn connector_extension_id\(self\)[\s\S]*?\{([\s\S]*?)\n    \}/,
    )?.[1];
    expect(dispatch, "DbEngine::connector_extension_id body").toBeTruthy();
    const rustExtensionIds = [...dispatch!.matchAll(/Some\("([^"]+)"\)/g)]
      .map((match) => match[1])
      .sort();

    expect(Object.values(connectorExtensionIds).sort()).toEqual(
      rustExtensionIds,
    );
  });

  it("classifies secret and option-bound fields", () => {
    const secret = model.authMethods[1].fields[0] as ConnectorConnectionField;
    const privateKey = model.tls.fields[0] as ConnectorConnectionField;
    const profileBound = model.endpoint.fields[0] as ConnectorConnectionField;
    const optionBound = model.endpoint.fields[1] as ConnectorConnectionField;
    const passwordBound = {
      id: "password",
      label: "Password",
      type: "string",
      required: false,
      profileField: "password",
    } as ConnectorConnectionField;

    expect(isConnectorSecretField(secret)).toBe(true);
    expect(isConnectorSecretField(privateKey)).toBe(true);
    expect(isConnectorSecretField(passwordBound)).toBe(true);
    expect(connectorFieldOptionKey(profileBound)).toBeNull();
    expect(connectorFieldOptionKey(optionBound)).toBe("protocol");
  });
});
