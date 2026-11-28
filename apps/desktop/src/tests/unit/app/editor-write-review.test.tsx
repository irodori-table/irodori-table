import { act, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useQueryRunner,
  type QueryRunnerDeps,
} from "@/app/controllers/use-query-runner";
import {
  useEditorCommands,
  type EditorCommandsDeps,
} from "@/app/controllers/use-editor-commands";
import { usePreferencesStore } from "@/features/preferences";
import { useConnectionStore } from "@/features/connections";
import type { ConfirmOptions } from "@/components/ConfirmDialog";
import type { ConnectionWriteTarget } from "@/features/connections/write-review";
import { createTranslator } from "@/i18n";
import type { QueryService } from "@/features/workbench";

const query = "SELECT 1; UPDATE orders SET amount=42;";
const { t } = createTranslator("en");

function harness({
  answer = false,
  readOnly = false,
  reviewWrites = true,
}: { answer?: boolean; readOnly?: boolean; reviewWrites?: boolean } = {}) {
  vi.stubGlobal("__TAURI_INTERNALS__", { invoke: vi.fn() });
  useConnectionStore.getState().setActiveConnectionId("stage");
  const revision = useConnectionStore.getState().activeConnectionRevision;
  const writeTarget: ConnectionWriteTarget = {
    id: "stage",
    name: "Staging",
    database: "billing",
    sessionId: "session-1",
    reviewWrites,
    revision,
    isCurrent: () =>
      useConnectionStore.getState().activeConnectionRevision === revision,
  };
  const confirm = vi.fn(async (_options: ConfirmOptions) => answer);
  const stream = vi.fn(async () => {});
  const service = {
    queryParameters: vi.fn(async () => ({ signature: "", prompts: [] })),
    stream,
    transactionPending: vi.fn(async () => false),
  } as unknown as QueryService;
  const deps = {
    activeConnectionId: "stage",
    activeEngine: "postgres",
    activeConnectionEngine: "postgres",
    activeConnectionName: "Staging",
    activeConnectionOpen: true,
    activeConnectionReadOnly: readOnly,
    queryService: service,
    resultOffloadEnabled: false,
    gridRef: { current: null },
    spillRef: { current: null },
    resultMemoryBudget: 0,
    writeTarget,
    confirm,
    t,
  };
  const fallback = vi.fn();
  const proxy = new Proxy(deps, {
    get(target, key: keyof typeof deps) {
      return key in target ? target[key] : fallback;
    },
  }) as unknown as QueryRunnerDeps;
  const { result } = renderHook(() => useQueryRunner(proxy));
  const commands = useEditorCommands({
    query,
    setRunMenuOpen: vi.fn(),
    activeEditorSelections: () => [
      { from: query.indexOf("UPDATE"), to: query.length },
    ],
    runEditorSqlWithRunner: result.current.runEditorSql,
  } as unknown as EditorCommandsDeps);
  return { result, confirm, stream, commands };
}

afterEach(() => {
  vi.unstubAllGlobals();
  usePreferencesStore.getState().setAutoCommit(true);
});

describe("protected editor execution", () => {
  it("cancels a selected write and a mixed run-all without dispatching", async () => {
    const { commands, confirm, stream } = harness();
    await act(async () => {
      await commands.runQuery();
      await commands.runAllQuery();
    });
    expect(stream).toHaveBeenCalledTimes(0);
    expect(confirm).toHaveBeenCalledTimes(2);
    const selection = render(<>{confirm.mock.calls[0][0].message}</>);
    expect(selection.container.querySelector("pre")?.textContent).toBe(
      "UPDATE orders SET amount=42;",
    );
    expect(selection.container.textContent).toContain(
      "Staging (stage) · Database: billing",
    );
    const batch = render(<>{confirm.mock.calls[1][0].message}</>);
    expect(batch.container.querySelector("pre")?.textContent).toBe(query);
  });

  it("dispatches only the approved selection, and runs a read directly", async () => {
    usePreferencesStore.getState().setAutoCommit(false);
    const { commands, result, confirm, stream } = harness({ answer: true });
    await act(async () => {
      await commands.runQuery();
      await result.current.executeQuery("SELECT 8");
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls).toHaveLength(2);
    expect(stream).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connectionId: "stage",
        sql: "UPDATE orders SET amount=42;",
        manualTransaction: true,
        sessionId: "session-1",
      }),
      expect.any(Function),
    );
    expect(stream).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ connectionId: "stage", sql: "SELECT 8" }),
      expect.any(Function),
    );
  });

  it("invalidates even a switch away and back before acceptance", async () => {
    const { commands, confirm, stream } = harness({ answer: true });
    confirm.mockImplementationOnce(async ({ signal }) => {
      useConnectionStore.getState().setActiveConnectionId("production");
      useConnectionStore.getState().setActiveConnectionId("stage");
      expect(signal?.aborted).toBe(true);
      return true;
    });
    await act(async () => {
      await commands.runAllQuery();
    });
    expect(stream).toHaveBeenCalledTimes(0);
  });

  it("executes a write directly when the profile has no opt-in", async () => {
    const { commands, confirm, stream } = harness({ reviewWrites: false });
    await act(async () => {
      await commands.runQuery();
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("blocks read-only writes before review", async () => {
    const { commands, confirm, stream } = harness({
      readOnly: true,
      answer: true,
    });
    await act(async () => {
      await commands.runAllQuery();
    });
    expect(confirm).toHaveBeenCalledTimes(0);
    expect(stream).toHaveBeenCalledTimes(0);
  });
});
