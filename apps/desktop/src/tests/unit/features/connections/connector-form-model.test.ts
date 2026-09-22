import { describe, expect, it } from "vitest";
import {
  connectorChoiceLabel,
  resolveConnectorFormModel,
} from "@/features/connections/connector-form-model";
import {
  newDraft,
  type ConnectionDraft,
} from "@/features/connections/connection-profiles";
import { engineOptionFields } from "@/features/connections/engine-connection-settings";
import { parseConnectorConnectionModel } from "@/features/extensions/connection-model";

const model = parseConnectorConnectionModel({
  schemaVersion: 1,
  endpoint: {
    modes: ["hostPort", "connectionString"],
    defaultPort: 6333,
    fields: [
      {
        id: "host",
        label: "Cluster host",
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
  profileFields: [
    { id: "region", label: "Region", type: "string", option: "region" },
  ],
  authMethods: [
    { id: "none", label: "No authentication", kind: "none", fields: [] },
    {
      id: "connectionString",
      label: "Connection string",
      kind: "connectionString",
      fields: [
        {
          id: "url",
          label: "Connection URL",
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
        // Collected by the endpoint section already; the auth section must
        // not ask for it a second time.
        {
          id: "protocol",
          label: "Protocol",
          type: "string",
          option: "protocol",
        },
        // Mapped onto a profile column, so the endpoint inputs own it.
        {
          id: "database",
          label: "Collection",
          type: "string",
          profileField: "database",
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
        id: "caCertificate",
        label: "CA certificate",
        type: "pem",
        option: "sslRootCert",
      },
    ],
  },
});

if (!model) {
  throw new Error("test connector model did not parse");
}

function draft(patch: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    ...newDraft(1),
    engine: "qdrant",
    mode: "fields",
    user: "",
    password: "",
    ...patch,
  };
}

describe("resolveConnectorFormModel", () => {
  it("leaves a built-in engine on the static layout", () => {
    const optionFields = engineOptionFields("postgres");
    const form = resolveConnectorFormModel(
      null,
      draft({ engine: "postgres" }),
      optionFields,
    );

    expect(form.connectionModel).toBeNull();
    expect(form.usesDeclaredEndpoint).toBe(false);
    expect(form.supportsUrlInput).toBe(true);
    expect(form.supportsFieldsInput).toBe(true);
    expect(form.compatibleAuthMethods).toEqual([]);
    expect(form.visibleOptionFields).toBe(optionFields);
  });

  it("splits declared fields into endpoint, auth, and TLS sections once", () => {
    const form = resolveConnectorFormModel(
      model,
      draft({ options: { authMethod: "apiKey" } }),
      [],
    );

    expect(form.usesDeclaredEndpoint).toBe(true);
    expect(form.hostField?.label).toBe("Cluster host");
    expect(form.portField).toBeUndefined();
    // The auth method's database field stands in for the built-in input.
    expect(form.databaseField?.label).toBe("Collection");
    expect(form.endpointExtraFields.map((field) => field.id)).toEqual([
      "protocol",
    ]);
    expect(form.supplementalProfileFields.map((field) => field.id)).toEqual([
      "region",
    ]);
    expect(form.selectedAuthMethod?.id).toBe("apiKey");
    // Neither the endpoint-owned protocol nor the profile-column database
    // field is asked for again under authentication.
    expect(form.authFields.map((field) => field.id)).toEqual(["apiKey"]);
    expect(form.tlsMode).toBe("prefer");
    expect(form.tlsFields.map((field) => field.id)).toEqual(["caCertificate"]);
  });

  it("filters endpoint modes and auth methods by the draft's input mode", () => {
    const fields = resolveConnectorFormModel(model, draft(), []);
    expect(fields.endpointModes).toEqual(["hostPort"]);
    expect(fields.compatibleAuthMethods.map((method) => method.id)).toEqual([
      "none",
      "apiKey",
    ]);

    const url = resolveConnectorFormModel(model, draft({ mode: "url" }), []);
    expect(url.endpointModes).toEqual(["connectionString"]);
    expect(url.compatibleAuthMethods.map((method) => method.id)).toEqual([
      "none",
      "connectionString",
      "apiKey",
    ]);
    expect(url.urlField?.label).toBe("Connection URL");
  });

  it("hides built-in option fields the connector declares itself", () => {
    const optionFields = engineOptionFields("postgres");
    expect(optionFields.some((field) => field.key === "sslRootCert")).toBe(
      true,
    );

    const form = resolveConnectorFormModel(model, draft(), optionFields);

    expect(form.visibleOptionFields.map((field) => field.key)).not.toContain(
      "sslRootCert",
    );
    expect(form.visibleOptionFields.map((field) => field.key)).toContain(
      "sslMode",
    );
  });

  it("drops TLS fields when the connector does not support TLS", () => {
    const plain = parseConnectorConnectionModel({
      schemaVersion: 1,
      endpoint: { modes: [], fields: [] },
      profileFields: [],
      authMethods: [],
      tls: {
        supported: false,
        requiredByDefault: false,
        modes: ["prefer"],
        fields: [{ id: "ca", label: "CA", type: "pem", option: "ca" }],
      },
    });
    if (!plain) {
      throw new Error("plain model did not parse");
    }

    const form = resolveConnectorFormModel(plain, draft(), []);

    expect(form.usesDeclaredEndpoint).toBe(false);
    expect(form.tlsFields).toEqual([]);
  });
});

describe("connectorChoiceLabel", () => {
  it("turns identifiers into sentence-case labels", () => {
    expect(connectorChoiceLabel("connectionString")).toBe("Connection String");
    expect(connectorChoiceLabel("verify-full")).toBe("Verify full");
    expect(connectorChoiceLabel("host_port")).toBe("Host port");
    expect(connectorChoiceLabel("direct")).toBe("Direct");
  });
});
