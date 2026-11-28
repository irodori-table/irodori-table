import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/core/errors";
import type { ConnectionWriteTarget } from "@/features/connections/write-review";
import type { QueryResult } from "@/generated/irodori-api";
import { queryService } from "@/features/workbench/query-service";
import type { NotebookCell } from "./notebook-document";

export type NotebookExecution = {
  target: Pick<
    ConnectionWriteTarget,
    "id" | "name" | "sessionId" | "isCurrent"
  >;
  reviewSql: (sql: string) => Promise<boolean>;
  manualTransaction: boolean;
  refreshTransactionStatus: () => Promise<void>;
};

type Outcome =
  | { state: "running"; cancelError?: string }
  | { state: "cancelling" | "cancelled" | "skipped" }
  | { state: "result"; result: QueryResult }
  | { state: "error"; message: string };
export type CellOutput = Outcome & { connection: string };

type PendingRun = {
  queryId: string;
  connection: string;
  dispatched: boolean;
  cancellation?: Promise<boolean>;
};

export function useNotebookRuns(execution: NotebookExecution) {
  const pending = useRef(new Map<string, PendingRun>()).current;
  const [outputs, setOutputs] = useState<Record<string, CellOutput>>({});

  useEffect(
    () => () => {
      for (const run of pending.values()) {
        if (run.dispatched && !run.cancellation) {
          void queryService.cancel(run.queryId).catch(() => {});
        }
      }
      pending.clear();
    },
    [pending],
  );

  function show(cellId: string, run: PendingRun, outcome: Outcome) {
    if (pending.get(cellId) !== run) return;
    if (outcome.state !== "running" && outcome.state !== "cancelling") {
      pending.delete(cellId);
    }
    setOutputs((current) => ({
      ...current,
      [cellId]: { ...outcome, connection: run.connection },
    }));
  }

  async function runCell(cell: NotebookCell) {
    const { target, manualTransaction, reviewSql, refreshTransactionStatus } =
      execution;
    if (
      cell.type !== "sql" ||
      !cell.source.trim() ||
      pending.has(cell.id) ||
      !target.isCurrent()
    )
      return;
    const run: PendingRun = {
      queryId: crypto.randomUUID(),
      connection: target.name,
      dispatched: false,
    };
    pending.set(cell.id, run);
    show(cell.id, run, { state: "running" });
    try {
      if (!(await reviewSql(cell.source)) || !target.isCurrent()) {
        show(cell.id, run, { state: "skipped" });
        return;
      }
      if (pending.get(cell.id) !== run) return;
      run.dispatched = true;
      const result = await queryService.execute({
        connectionId: target.id,
        sessionId: target.sessionId,
        sql: cell.source,
        queryId: run.queryId,
        maxRows: 200,
        manualTransaction,
      });
      if (!(await run.cancellation))
        show(cell.id, run, { state: "result", result });
    } catch (error) {
      if (!(await run.cancellation))
        show(cell.id, run, { state: "error", message: errorMessage(error) });
    } finally {
      if (run.dispatched) void refreshTransactionStatus();
    }
  }

  async function cancelCell(cellId: string, unavailable: string) {
    const run = pending.get(cellId);
    if (!run || run.cancellation) return;
    if (!run.dispatched) {
      show(cellId, run, { state: "cancelled" });
      return;
    }
    show(cellId, run, { state: "cancelling" });
    let cancelError = unavailable;
    run.cancellation = queryService.cancel(run.queryId).catch((error) => {
      cancelError = errorMessage(error);
      return false;
    });
    if (await run.cancellation) {
      show(cellId, run, { state: "cancelled" });
    } else {
      run.cancellation = undefined;
      show(cellId, run, { state: "running", cancelError });
    }
  }

  function clearOutput(cellId: string) {
    setOutputs((current) => {
      if (!(cellId in current)) return current;
      const next = { ...current };
      delete next[cellId];
      return next;
    });
  }

  return { outputs, runCell, cancelCell, clearOutput };
}
