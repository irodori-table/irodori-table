import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionInfo } from "@/generated/irodori-api";

const connect = vi.fn<(profile: { id: string }) => Promise<ConnectionInfo>>();
const disconnect = vi.fn<(id: string) => Promise<void>>();

vi.mock("@/features/workbench", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workbench")>()),
  queryService: {
    connect: (profile: { id: string }) => connect(profile),
    disconnect: (id: string) => disconnect(id),
    listObjects: vi.fn(async () => ({ schemas: [] })),
  },
}));

const { useConnectionActions } =
  await import("@/app/controllers/use-connection-actions");
const { createConnectionAttemptTracker, newDraft } =
  await import("@/features/connections");
const { createTranslator } = await import("@/i18n");

/**
 * Connect and Test against a host that never answers used to wait until the
 * OS dropped the TCP handshake. They now give up after ten seconds or on
 * Cancel, free the dialog, and close a connection that answers too late.
 */

const { t } = createTranslator("en");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const profile = {
    ...newDraft(1),
    id: "connection-1",
    name: "prod - takana",
    host: "10.0.0.9",
    database: "takana",
    rememberPassword: false,
  };
  const deps = {
    draft: profile,
    profiles: [profile],
    connectedIds: new Set<string>(),
    activeConnectionId: "",
    setDraft: vi.fn(),
    setProfiles: vi.fn(),
    setSelectedProfileId: vi.fn(),
    setConnectionError: vi.fn(),
    setActiveConnectionId: vi.fn(),
    setConnectionSearch: vi.fn(),
    setConnectedIds: vi.fn(),
    setLiveConnections: vi.fn(),
    setMetadataByConnection: vi.fn(),
    setMetadataErrors: vi.fn(),
    setMetadataLoading: vi.fn(),
    setTestingConnection: vi.fn(),
    setConnecting: vi.fn(),
    setConnectionManagerOpen: vi.fn(),
    showActionNotice: vi.fn(),
    t,
    installedExtensions: [],
    attemptTracker: createConnectionAttemptTracker(),
  };
  return { profile, deps, actions: () => useConnectionActions(deps) };
}

const info = (id: string): ConnectionInfo => ({
  id,
  engine: "postgres",
  serverVersion: "18.6",
});

beforeEach(() => {
  vi.useFakeTimers();
  connect.mockReset();
  disconnect.mockReset();
  disconnect.mockResolvedValue(undefined);
  (
    window as unknown as { __TAURI_INTERNALS__?: { invoke: () => void } }
  ).__TAURI_INTERNALS__ = { invoke: () => undefined };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
});

describe("connect attempts", () => {
  it("gives up on Connect after ten seconds and offers Retry", async () => {
    const pending = deferred<ConnectionInfo>();
    connect.mockReturnValue(pending.promise);
    const { profile, deps, actions } = harness();

    const run = actions().connectProfile(profile);
    await vi.advanceTimersByTimeAsync(10_000);
    await run;

    expect(deps.setConnecting).toHaveBeenLastCalledWith(false);
    expect(deps.setConnectionError).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "timeout", retryable: true }),
    );
    expect(deps.showActionNotice).toHaveBeenCalledWith(
      "error",
      "Connect failed",
      expect.stringContaining("10 seconds"),
      expect.objectContaining({
        action: expect.objectContaining({ label: "Retry" }),
      }),
    );
    expect(deps.setConnectionManagerOpen).not.toHaveBeenCalled();

    // The server answers after all: nobody is waiting, so it is closed.
    pending.resolve(info(profile.id));
    await vi.runAllTimersAsync();
    expect(disconnect).toHaveBeenCalledWith(profile.id);
  });

  it("stops waiting on Cancel without reporting a failure", async () => {
    const pending = deferred<ConnectionInfo>();
    connect.mockReturnValue(pending.promise);
    const { profile, deps, actions } = harness();

    const run = actions().connectProfile(profile);
    await vi.advanceTimersByTimeAsync(1_000);
    // A later render's actions reach the attempt an earlier render started.
    actions().cancelConnectionAttempts();
    await run;

    expect(deps.setConnecting).toHaveBeenLastCalledWith(false);
    expect(deps.showActionNotice).toHaveBeenCalledWith(
      "info",
      "Connect cancelled",
      "prod - takana",
    );
    expect(deps.setConnectionError).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "timeout" }),
    );
  });

  it("leaves a late connection alone when a newer attempt took over", async () => {
    const first = deferred<ConnectionInfo>();
    const second = deferred<ConnectionInfo>();
    connect.mockReturnValueOnce(first.promise);
    connect.mockReturnValueOnce(second.promise);
    const { profile, actions } = harness();

    const firstRun = actions().connectProfile(profile);
    actions().cancelConnectionAttempts();
    await firstRun;
    const secondRun = actions().connectProfile(profile);
    await vi.advanceTimersByTimeAsync(0);

    first.resolve(info(profile.id));
    await vi.advanceTimersByTimeAsync(0);
    expect(disconnect).not.toHaveBeenCalled();

    second.resolve(info(profile.id));
    await secondRun;
  });

  it("gives up on Test after ten seconds and closes the late test session", async () => {
    const pending = deferred<ConnectionInfo>();
    connect.mockReturnValue(pending.promise);
    const { deps, actions } = harness();

    const run = actions().testActiveProfile();
    await vi.advanceTimersByTimeAsync(10_000);
    await run;

    expect(deps.setTestingConnection).toHaveBeenLastCalledWith(false);
    expect(deps.showActionNotice).toHaveBeenCalledWith(
      "error",
      "Connection test failed",
      expect.stringContaining("10 seconds"),
    );

    const testId = connect.mock.calls[0]![0].id;
    expect(testId).toMatch(/^__test_connection-1_/);
    pending.resolve(info(testId));
    await vi.runAllTimersAsync();
    expect(disconnect).toHaveBeenCalledWith(testId);
  });
});
