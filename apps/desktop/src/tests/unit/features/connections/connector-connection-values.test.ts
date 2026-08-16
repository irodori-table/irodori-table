import { describe, expect, it } from "vitest";
import {
  connectorAuthMethodPatch,
  connectorFieldDraftPatch,
  connectorFieldValue,
  connectorRequestOptions,
  parseCustomConnectorOptions,
  selectedConnectorAuthMethod,
  selectedConnectorEndpointMode,
  selectedConnectorTlsMode,
  validateConnectorConnectionDraft,
} from "@/features/connections/connector-connection-values";
import {
  profileFromDraft,
  sanitizedProfile,
  validateDraft,
  type ConnectionDraft,
} from "@/features/connections/connection-profiles";
import { parseConnectorConnectionModel } from "@/features/extensions/connection-model";

const model = parseConnectorConnectionModel({
  schemaVersion: 1,
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
        required: true,
      },
    ],
  },
  profileFields: [],
  authMethods: [
    { id: "none", label: "No authentication", kind: "none", fields: [] },
    {
      id: "connectionString",
      label: "Connection string / DSN",
      kind: "connectionString",
      fields: [
        {
          id: "url",
          label: "Connection URL or DSN",
          type: "uri",
          profileField: "url",
          required: true,
        },
      ],
    },
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
          required: true,
        },
      ],
    },
    {
      id: "customDriverOptions",
      label: "Custom driver options",
      kind: "custom",
      fields: [
        {
          id: "options",
          label: "Driver options",
          type: "map",
          profileField: "options",
        },
      ],
    },
  ],
  tls: {
    supported: true,
    requiredByDefault: false,
    modes: ["disable", "prefer", "verifyFull"],
    fields: [
      {
        id: "clientPrivateKey",
        label: "Client private key",
        type: "pem",
        secretPurpose: "privateKey",
      },
    ],
  },
});

if (!model) {
  throw new Error("test connector model did not parse");
}

function draft(patch: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    id: "vectors",
    name: "Vectors",
    color: "#abcdef",
    engine: "qdrant",
    mode: "fields",
    url: "",
    connectionTransport: "tcp",
    host: "qdrant.example.test",
    port: "6333",
    user: "legacy-user",
    password: "legacy-password",
    database: "vectors",
    socketPath: "",
    readOnly: false,
    ...patch,
  };
}

describe("connector connection values", () => {
  it("derives compatible endpoint, auth, and TLS defaults", () => {
    const current = draft({ user: "", password: "" });

    expect(selectedConnectorEndpointMode(model, current)).toBe("hostPort");
    expect(selectedConnectorAuthMethod(model, current)?.id).toBe("none");
    expect(selectedConnectorTlsMode(model, current)).toBe("prefer");
    expect(
      selectedConnectorAuthMethod(model, { ...current, mode: "url" })?.id,
    ).toBe("connectionString");
    expect(
      selectedConnectorAuthMethod(model, {
        ...current,
        options: { authMethod: "connectionString" },
      })?.id,
    ).toBe("none");
  });

  it("routes declared secrets to the draft-only map", () => {
    const apiKeyField = model.authMethods[2].fields[0];
    const patch = connectorFieldDraftPatch(draft(), apiKeyField, "top-secret");

    expect(patch).toEqual({ secretOptions: { apiKey: "top-secret" } });
    expect(connectorFieldValue({ ...draft(), ...patch }, apiKeyField)).toBe(
      "top-secret",
    );
  });

  it("cannot bind an untrusted secret declaration to a persisted profile field", () => {
    const unsafeModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["hostPort"],
        fields: [
          {
            id: "databaseCredential",
            label: "Database credential",
            type: "secret",
            profileField: "database",
            secretPurpose: "token",
          },
        ],
      },
      profileFields: [],
      authMethods: [],
      tls: { supported: false, modes: [], fields: [] },
    });
    if (!unsafeModel) {
      throw new Error("unsafe-binding model did not parse");
    }
    const field = unsafeModel.endpoint.fields[0];
    const patch = connectorFieldDraftPatch(draft(), field, "top-secret");

    expect(field.profileField).toBeUndefined();
    expect(patch).toEqual({
      secretOptions: { databaseCredential: "top-secret" },
    });
    expect(patch).not.toHaveProperty("database");
  });

  it("builds a request from declared keys without leaking legacy credentials", () => {
    const current = draft({
      options: { authMethod: "apiKey" },
      secretOptions: { apiKey: "top-secret" },
    });

    expect(connectorRequestOptions(model, current)).toEqual({
      endpointMode: "hostPort",
      protocol: "rest",
      authMethod: "apiKey",
      apiKey: "top-secret",
      tlsMode: "prefer",
    });
    expect(profileFromDraft(current, model)).toMatchObject({
      user: undefined,
      password: undefined,
      options: expect.objectContaining({ apiKey: "top-secret" }),
    });
  });

  it("keeps only model-selected profile credentials beside a URL", () => {
    const urlAuthModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: { modes: ["connectionString"], fields: [] },
      profileFields: [],
      authMethods: [
        { id: "none", label: "No authentication", kind: "none", fields: [] },
        {
          id: "userPassword",
          label: "User and password",
          kind: "userPassword",
          fields: [
            {
              id: "user",
              label: "User",
              type: "string",
              profileField: "user",
            },
            {
              id: "password",
              label: "Password",
              type: "secret",
              profileField: "password",
              secretPurpose: "password",
            },
          ],
        },
      ],
      tls: { supported: false, modes: [], fields: [] },
    });
    if (!urlAuthModel) {
      throw new Error("URL auth model did not parse");
    }
    const current = draft({
      mode: "url",
      url: "https://vectors.example.test",
      user: "analyst",
      password: "top-secret",
      options: { authMethod: "userPassword" },
    });

    expect(profileFromDraft(current, urlAuthModel)).toMatchObject({
      url: "https://vectors.example.test",
      user: "analyst",
      password: "top-secret",
      options: { authMethod: "userPassword" },
    });
    const withoutCredentials = profileFromDraft(
      { ...current, options: { authMethod: "none" } },
      urlAuthModel,
    );
    expect(withoutCredentials).not.toHaveProperty("user");
    expect(withoutCredentials).not.toHaveProperty("password");
  });

  it("resolves model defaults into profile-bound request fields", () => {
    const defaultsModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["hostPort"],
        defaultPort: 7444,
        fields: [
          {
            id: "host",
            label: "Host",
            type: "string",
            profileField: "host",
            default: "vectors.default.test",
            required: true,
          },
          {
            id: "port",
            label: "Port",
            type: "number",
            profileField: "port",
          },
        ],
      },
      profileFields: [],
      authMethods: [
        { id: "none", label: "No authentication", kind: "none", fields: [] },
      ],
      tls: { supported: false, modes: [], fields: [] },
    });
    if (!defaultsModel) {
      throw new Error("defaults model did not parse");
    }

    const current = draft({ host: "", port: "", user: "", password: "" });
    expect(validateDraft(current, defaultsModel)).toBeNull();
    expect(profileFromDraft(current, defaultsModel)).toMatchObject({
      host: "vectors.default.test",
      port: 7444,
    });

    const invalidPortModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["hostPort"],
        fields: [
          {
            id: "port",
            label: "Port",
            type: "string",
            profileField: "port",
            default: "not-a-port",
          },
        ],
      },
      profileFields: [],
      authMethods: [
        { id: "none", label: "No authentication", kind: "none", fields: [] },
      ],
      tls: { supported: false, modes: [], fields: [] },
    });
    expect(validateDraft(current, invalidPortModel)).toBe(
      "port must be a number",
    );
  });

  it("uses supplemental profile fields and TLS fields without a mode picker", () => {
    const supplementalModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["cloudResource"],
        fields: [],
      },
      profileFields: [
        {
          id: "tenant",
          label: "Tenant",
          type: "string",
          option: "tenant",
          required: true,
        },
      ],
      authMethods: [
        { id: "none", label: "No authentication", kind: "none", fields: [] },
      ],
      tls: {
        supported: true,
        requiredByDefault: true,
        modes: [],
        fields: [
          {
            id: "serverName",
            label: "TLS server name",
            type: "string",
            option: "serverName",
            required: true,
          },
        ],
      },
    });
    if (!supplementalModel) {
      throw new Error("supplemental model did not parse");
    }

    const missing = draft({ user: "", options: {} });
    expect(validateConnectorConnectionDraft(supplementalModel, missing)).toBe(
      "tenant is required",
    );

    const current = draft({
      user: "",
      options: {
        tenant: "tenant-a",
        serverName: "db.example.test",
      },
    });
    expect(
      validateConnectorConnectionDraft(supplementalModel, current),
    ).toBeNull();
    expect(connectorRequestOptions(supplementalModel, current)).toEqual({
      endpointMode: "cloudResource",
      tenant: "tenant-a",
      authMethod: "none",
      serverName: "db.example.test",
    });
  });

  it("never persists the extension secret map", () => {
    const safe = sanitizedProfile(
      draft({
        options: { authMethod: "apiKey" },
        secretOptions: { apiKey: "top-secret", clientPrivateKey: "PEM" },
        customOptionsJson: '{"accessToken":"also-secret"}',
      }),
    );

    expect(safe).not.toHaveProperty("secretOptions");
    expect(safe).not.toHaveProperty("customOptionsJson");
    expect(JSON.stringify(safe)).not.toContain("top-secret");
    expect(JSON.stringify(safe)).not.toContain("PEM");
    expect(JSON.stringify(safe)).not.toContain("also-secret");
  });

  it("parses and sends a transient custom driver-options map", () => {
    const customField = model.authMethods[3].fields[0];
    const customJson = JSON.stringify({
      cluster: "analytics",
      retries: 3,
      enabled: true,
    });
    const current = draft({
      user: "",
      password: "",
      options: { authMethod: "customDriverOptions" },
      ...connectorFieldDraftPatch(draft(), customField, customJson),
    });

    expect(current.customOptionsJson).toBe(customJson);
    expect(parseCustomConnectorOptions(customJson)).toEqual({
      options: { cluster: "analytics", retries: "3", enabled: "true" },
      error: null,
    });
    expect(validateConnectorConnectionDraft(model, current)).toBeNull();
    expect(connectorRequestOptions(model, current)).toMatchObject({
      authMethod: "customDriverOptions",
      cluster: "analytics",
      retries: "3",
      enabled: "true",
    });
  });

  it("rejects malformed, nested, and request-control custom options", () => {
    expect(parseCustomConnectorOptions("not-json").error).toBe(
      "driver options must be valid JSON",
    );
    expect(
      parseCustomConnectorOptions('{"nested":{"token":"secret"}}').error,
    ).toBe("driver option nested must be a string, number, or boolean");
    expect(parseCustomConnectorOptions('{"authMethod":"none"}').error).toBe(
      "driver option key authMethod is not allowed",
    );
  });

  it("validates required fields from the selected method", () => {
    const missing = draft({
      user: "",
      password: "",
      options: { authMethod: "apiKey" },
    });

    expect(validateConnectorConnectionDraft(model, missing)).toBe(
      "api key is required",
    );
    expect(
      validateConnectorConnectionDraft(model, {
        ...missing,
        secretOptions: { apiKey: "set" },
      }),
    ).toBeNull();
  });

  it("validates declared number and JSON field types before invoking a connector", () => {
    const typedModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["hostPort"],
        fields: [
          {
            id: "poolSize",
            label: "Pool size",
            type: "number",
          },
        ],
      },
      profileFields: [],
      authMethods: [
        {
          id: "serviceAccount",
          label: "Service account",
          kind: "serviceAccount",
          fields: [
            {
              id: "serviceAccountJson",
              label: "Service account JSON",
              type: "json",
              secretPurpose: "privateKey",
            },
          ],
        },
      ],
      tls: { supported: false, modes: [], fields: [] },
    });
    if (!typedModel) {
      throw new Error("typed model did not parse");
    }

    expect(
      validateConnectorConnectionDraft(
        typedModel,
        draft({
          options: { authMethod: "serviceAccount", poolSize: "many" },
          secretOptions: { serviceAccountJson: "{}" },
        }),
      ),
    ).toBe("pool size must be a number");
    expect(
      validateConnectorConnectionDraft(
        typedModel,
        draft({
          options: { authMethod: "serviceAccount", poolSize: "4" },
          secretOptions: { serviceAccountJson: "{" },
        }),
      ),
    ).toBe("service account json must be valid JSON");
  });

  it("lets a connector declare an optional custom endpoint host", () => {
    const cloudModel = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: {
        modes: ["cloudResource", "customEndpoint", "connectionString"],
        defaultPort: 443,
        fields: [
          {
            id: "region",
            label: "AWS region",
            type: "string",
            option: "region",
            required: true,
          },
          {
            id: "endpoint",
            label: "Custom endpoint",
            type: "uri",
            profileField: "host",
          },
        ],
      },
      profileFields: [],
      authMethods: [
        { id: "none", label: "No authentication", kind: "none", fields: [] },
      ],
      tls: { supported: false, modes: [], fields: [] },
    });
    if (!cloudModel) {
      throw new Error("cloud connector model did not parse");
    }

    expect(
      validateDraft(
        draft({
          engine: "athena",
          host: "",
          port: "443",
          user: "",
          password: "",
          options: { region: "us-east-1" },
        }),
        cloudModel,
      ),
    ).toBeNull();
  });

  it("clears every prior secret when the auth method changes", () => {
    const patch = connectorAuthMethodPatch(
      model,
      draft({
        options: { authMethod: "apiKey", protocol: "rest" },
        secretOptions: { apiKey: "secret", clientPrivateKey: "key" },
      }),
      "none",
    );

    expect(patch).toMatchObject({
      password: "",
      options: { authMethod: "none", protocol: "rest" },
      secretOptions: { clientPrivateKey: "key" },
    });
  });

  it("clears a credential-bearing DSN when leaving connection-string auth", () => {
    const patch = connectorAuthMethodPatch(
      model,
      draft({
        mode: "url",
        url: "qdrant://token@vectors.example.test",
        options: { authMethod: "connectionString" },
      }),
      "apiKey",
    );

    expect(patch).toMatchObject({
      mode: "fields",
      url: "",
      password: "",
      options: { authMethod: "apiKey" },
    });
  });
});
