import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ConnectionManagerDialog } from "@/features/connections/ConnectionManagerDialog";
import type { ConnectionDraft } from "@/features/connections/connection-profiles";
import { parseConnectorConnectionModel } from "@/features/extensions/connection-model";
import "@/App.css";

const connectionModel = parseConnectorConnectionModel({
  schemaVersion: 1,
  endpoint: {
    modes: ["hostPort", "customEndpoint", "connectionString"],
    defaultPort: 6333,
    fields: [
      {
        id: "host",
        label: "Vector database host",
        type: "string",
        profileField: "host",
        required: true,
      },
      {
        id: "port",
        label: "Vector database port",
        type: "number",
        profileField: "port",
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
      id: "oauth2",
      label: "OAuth 2.0",
      kind: "oauth2",
      fields: [
        { id: "clientId", label: "Client ID", type: "string" },
        {
          id: "clientSecret",
          label: "Client secret",
          type: "secret",
          secretPurpose: "token",
        },
        {
          id: "accessToken",
          label: "Access token",
          type: "secret",
          secretPurpose: "token",
        },
        {
          id: "refreshToken",
          label: "Refresh token",
          type: "secret",
          secretPurpose: "token",
        },
        { id: "scope", label: "OAuth scope", type: "string" },
      ],
    },
  ],
  tls: {
    supported: true,
    requiredByDefault: false,
    modes: ["disable", "prefer", "require", "verifyCa", "verifyFull"],
    fields: [
      { id: "caCertificate", label: "CA certificate", type: "pem" },
      {
        id: "clientCertificate",
        label: "Client certificate",
        type: "pem",
      },
      {
        id: "clientPrivateKey",
        label: "Client private key",
        type: "pem",
        secretPurpose: "privateKey",
      },
    ],
  },
});

if (!connectionModel) {
  throw new Error("browser connector model did not parse");
}

const profile: ConnectionDraft = {
  id: "vector-prod",
  name: "Vector production",
  color: "#b9cceb",
  engine: "qdrant",
  mode: "fields",
  url: "",
  connectionTransport: "tcp",
  host: "vectors.example.test",
  port: "6333",
  user: "",
  password: "",
  database: "vectors",
  socketPath: "",
  readOnly: true,
  options: { authMethod: "oauth2" },
};

const cleanups: Array<() => void> = [];

function mountDialog() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => {
    root.render(
      <ConnectionManagerDialog
        profiles={[profile]}
        connectedIds={new Set()}
        selectedProfileId={profile.id}
        draft={profile}
        search=""
        error={null}
        testing={false}
        connecting={false}
        connectionModel={connectionModel}
        onClose={vi.fn()}
        onSearchChange={vi.fn()}
        onAddProfile={vi.fn()}
        onImportProfiles={vi.fn()}
        onExportProfiles={vi.fn()}
        onSelectProfile={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteProfiles={vi.fn()}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onConnect={vi.fn()}
        onOpenSqliteSample={vi.fn()}
      />,
    );
  });
  cleanups.push(() => {
    flushSync(() => root.unmount());
    host.remove();
  });
}

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
});

describe("extension connection form (real layout)", () => {
  it("keeps a long endpoint/auth/TLS form and its actions inside the viewport", async () => {
    mountDialog();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const dialog = document.querySelector<HTMLElement>(".connection-dialog");
    const body = document.querySelector<HTMLElement>(".connection-form-body");
    const footer = document.querySelector<HTMLElement>(
      ".connection-form .dialog-footer",
    );
    const connect = footer?.querySelector<HTMLElement>(".primary-action");

    expect(dialog).not.toBeNull();
    expect(body).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(connect).not.toBeNull();
    expect(
      document.querySelectorAll(".connector-declared-section"),
    ).toHaveLength(3);

    const dialogRect = dialog!.getBoundingClientRect();
    const footerRect = footer!.getBoundingClientRect();
    const connectRect = connect!.getBoundingClientRect();

    expect(dialogRect.width).toBeGreaterThan(600);
    expect(dialogRect.height).toBeGreaterThan(500);
    expect(dialogRect.left).toBeGreaterThanOrEqual(0);
    expect(dialogRect.top).toBeGreaterThanOrEqual(0);
    expect(dialogRect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(dialogRect.bottom).toBeLessThanOrEqual(window.innerHeight);

    expect(body!.scrollHeight).toBeGreaterThan(body!.clientHeight);
    expect(getComputedStyle(body!).overflowY).toBe("auto");
    expect(body!.scrollWidth).toBeLessThanOrEqual(body!.clientWidth + 1);

    expect(footerRect.left).toBeGreaterThanOrEqual(dialogRect.left);
    expect(footerRect.right).toBeLessThanOrEqual(dialogRect.right);
    expect(footerRect.bottom).toBeLessThanOrEqual(dialogRect.bottom);
    expect(connectRect.width).toBeGreaterThan(0);
    expect(connectRect.height).toBeGreaterThan(0);

    const painted = document.elementFromPoint(
      connectRect.left + connectRect.width / 2,
      connectRect.top + connectRect.height / 2,
    );
    expect(painted).not.toBeNull();
    expect(connect!.contains(painted)).toBe(true);
  });

  it("keeps the responsive one-column dialog usable on a narrow viewport", async () => {
    await page.viewport(700, 760);
    try {
      mountDialog();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const dialog = document.querySelector<HTMLElement>(".connection-dialog");
      const picker = document.querySelector<HTMLElement>(".connection-picker");
      const body = document.querySelector<HTMLElement>(".connection-form-body");
      const footer = document.querySelector<HTMLElement>(
        ".connection-form .dialog-footer",
      );
      const connect = footer?.querySelector<HTMLElement>(".primary-action");

      expect(dialog).not.toBeNull();
      expect(picker).not.toBeNull();
      expect(body).not.toBeNull();
      expect(footer).not.toBeNull();
      expect(connect).not.toBeNull();

      const dialogRect = dialog!.getBoundingClientRect();
      const pickerRect = picker!.getBoundingClientRect();
      const footerRect = footer!.getBoundingClientRect();
      const connectRect = connect!.getBoundingClientRect();

      expect(
        getComputedStyle(dialog!).gridTemplateColumns.split(" "),
      ).toHaveLength(1);
      expect(dialogRect.left).toBeGreaterThanOrEqual(0);
      expect(dialogRect.right).toBeLessThanOrEqual(window.innerWidth);
      expect(dialogRect.bottom).toBeLessThanOrEqual(window.innerHeight);
      expect(pickerRect.height).toBeLessThanOrEqual(221);
      expect(body!.scrollHeight).toBeGreaterThan(body!.clientHeight);
      expect(body!.scrollWidth).toBeLessThanOrEqual(body!.clientWidth + 1);
      expect(footerRect.bottom).toBeLessThanOrEqual(dialogRect.bottom);

      const painted = document.elementFromPoint(
        connectRect.left + connectRect.width / 2,
        connectRect.top + connectRect.height / 2,
      );
      expect(connect!.contains(painted)).toBe(true);
    } finally {
      await page.viewport(1280, 900);
    }
  });
});
