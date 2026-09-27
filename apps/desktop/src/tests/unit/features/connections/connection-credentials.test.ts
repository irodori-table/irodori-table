import { describe, expect, it, vi } from "vitest";
import {
  PASSWORD_SECRET_OPTION,
  prepareStoredPassword,
  type CredentialIo,
} from "@/features/connections/connection-credentials";
import type { ConnectionDraft } from "@/lib/workspace-connection";
import type { ConnectionProfile, DbEngine } from "@/generated/irodori-api";

const ref = (handle: string) => ({ handle });

function draft(patch: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    id: "prod",
    name: "Prod",
    color: "#000000",
    engine: "postgres" as DbEngine,
    mode: "fields",
    url: "",
    connectionTransport: "tcp",
    host: "db.example.test",
    port: "5432",
    user: "reader",
    password: "",
    database: "app",
    socketPath: "",
    readOnly: false,
    ...patch,
  };
}

function profile(patch: Partial<ConnectionProfile<DbEngine>> = {}) {
  return {
    id: "prod",
    engine: "postgres" as DbEngine,
    host: "db.example.test",
    port: 5432,
    user: "reader",
    password: "",
    auth: {},
    tls: {},
    database: "app",
    socketPath: undefined,
    url: undefined,
    transport: undefined,
    readOnly: false,
    options: {},
    ...patch,
  } as ConnectionProfile<DbEngine>;
}

function io(): CredentialIo {
  return {
    storeSecret: vi.fn(async () => ref("connections/prod/password")),
    deleteSecret: vi.fn(async () => {}),
  };
}

describe("prepareStoredPassword", () => {
  it("stores a typed password and persists only the handle", async () => {
    const credentials = io();
    const result = await prepareStoredPassword(
      draft({ password: "s3cret" }),
      profile(),
      credentials,
    );

    expect(credentials.storeSecret).toHaveBeenCalledWith(
      "prod",
      "password",
      "s3cret",
    );
    expect(result.profile.options?.[PASSWORD_SECRET_OPTION]).toBe(
      JSON.stringify(ref("connections/prod/password")),
    );
    expect(result.options?.[PASSWORD_SECRET_OPTION]).toBe(
      JSON.stringify(ref("connections/prod/password")),
    );
    // The secret itself never lands in the profile.
    expect(result.profile.password).toBe("");
  });

  it("forwards an already-remembered handle when the field is blank", async () => {
    const credentials = io();
    const stored = JSON.stringify(ref("connections/prod/password"));
    const result = await prepareStoredPassword(
      draft({ options: { [PASSWORD_SECRET_OPTION]: stored } }),
      profile(),
      credentials,
    );

    expect(credentials.storeSecret).not.toHaveBeenCalled();
    expect(result.profile.options?.[PASSWORD_SECRET_OPTION]).toBe(stored);
  });

  it("deletes the stored copy when remembering is turned off", async () => {
    const credentials = io();
    const stored = JSON.stringify(ref("connections/prod/password"));
    const result = await prepareStoredPassword(
      draft({
        rememberPassword: false,
        options: { [PASSWORD_SECRET_OPTION]: stored },
      }),
      profile(),
      credentials,
    );

    expect(credentials.deleteSecret).toHaveBeenCalledWith(
      ref("connections/prod/password"),
    );
    expect(result.profile.options?.[PASSWORD_SECRET_OPTION]).toBeUndefined();
    expect(result.options?.[PASSWORD_SECRET_OPTION]).toBeUndefined();
  });

  it("never writes a secret for a test attempt", async () => {
    const credentials = io();
    const result = await prepareStoredPassword(
      draft({ password: "s3cret" }),
      profile(),
      credentials,
      false,
    );

    expect(credentials.storeSecret).not.toHaveBeenCalled();
    expect(result.profile.options?.[PASSWORD_SECRET_OPTION]).toBeUndefined();
  });
});
