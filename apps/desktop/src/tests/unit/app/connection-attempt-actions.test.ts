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
 * Cancel and free the dialog. A connect that answers after Cancel is closed;
 * one that answers after the timeout was only slow (a cold server, a keychain
 * prompt), so it is kept without taking focus.
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
  });

  it("keeps a connect that answers after the timeout, without taking focus", async () => {
    const pending = deferred<ConnectionInfo>();
    connect.mockReturnValue(pending.promise);
    const { profile, deps, actions } = harness();
    deps.connectedIds = new Set(["connection-other"]);

    const run = actions().connectProfile(profile);
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    const shownError = deps.setConnectionError.mock.lastCall![0];

    // A keychain prompt answered, or a cold server woke up.
    pending.resolve(info(profile.id));
    await vi.runAllTimersAsync();

    expect(disconnect).not.toHaveBeenCalled();
    const connected = deps.setConnectedIds.mock.lastCall![0] as (
      current: Set<string>,
    ) => Set<string>;
    expect([...connected(new Set())]).toEqual([profile.id]);
    expect(deps.showActionNotice).toHaveBeenLastCalledWith(
      "success",
      "Connected",
      expect.stringContaining("prod - takana"),
    );
    // The timeout callout clears, but only if it is still the one shown.
    const clearError = deps.setConnectionError.mock.lastCall![0] as (
      current: unknown,
    ) => unknown;
    expect(clearError(shownError)).toBeNull();
    const other = { kind: "auth" };
    expect(clearError(other)).toBe(other);
    // The user is working on another live connection: it stays active.
    const activate = deps.setActiveConnectionId.mock.lastCall![0] as (
      current: string,
    ) => string;
    expect(activate("connection-other")).toBe("connection-other");
    expect(activate("")).toBe(profile.id);
    expect(deps.setConnectionManagerOpen).not.toHaveBeenCalled();
  });

  it("closes a late connect whose profile was deleted meanwhile", async () => {
    const pending = deferred<ConnectionInfo>();
    connect.mockReturnValue(pending.promise);
    const { profile, deps, actions } = harness();

    const run = actions().connectProfile(profile);
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    deps.profiles = [];
    actions();
    pending.resolve(info(profile.id));
    await vi.runAllTimersAsync();

    expect(disconnect).toHaveBeenCalledWith(profile.id);
    expect(deps.setConnectedIds).not.toHaveBeenCalled();
  });

  it("keeps edits saved while a late connect was pending", async () => {
    const pending = deferred<ConnectionInfo>();
    connect.mockReturnValue(pending.promise);
    const { profile, deps, actions } = harness();

    const run = actions().connectProfile(profile);
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    pending.resolve(info(profile.id));
    await vi.runAllTimersAsync();

    const persist = deps.setProfiles.mock.lastCall![0] as (
      current: Array<typeof profile>,
    ) => Array<typeof profile>;
    const edited = { ...profile, options: { sslmode: "require" } };
    expect(persist([edited])[0]!.options).toEqual({ sslmode: "require" });
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

    // The server answers after all: the user asked to stop, so it is closed.
    pending.resolve(info(profile.id));
    await vi.runAllTimersAsync();
    expect(disconnect).toHaveBeenCalledWith(profile.id);
    expect(deps.setConnectedIds).not.toHaveBeenCalled();
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
    // The failure notice was only about the wait; the host answered.
    expect(deps.showActionNotice).toHaveBeenLastCalledWith(
      "success",
      "Connection test succeeded",
      expect.stringContaining("prod - takana"),
    );
  });
});
