import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/features/preferences";
import type { DbEngine } from "@/generated/irodori-api";
import type { QueryService } from "@/features/workbench";

export function useEditorTransaction(
  connectionId: string,
  open: boolean,
  engine: DbEngine,
  service: QueryService,
) {
  const autoCommit = usePreferencesStore((state) => state.autoCommit);
  const supported = engine === "postgres";
  const [pendingId, setPendingId] = useState<string | null>(null);
  const revision = useRef(0);
  const currentId = useRef(connectionId);
  currentId.current = connectionId;
  const refreshTransactionStatus = useCallback(async () => {
    if (!open || !supported || currentId.current !== connectionId) return;
    const request = ++revision.current;
    try {
      const pending = await service.transactionPending(connectionId);
      if (revision.current === request)
        setPendingId(pending ? connectionId : null);
    } catch {
      // Preserve the last reported state during a transient status lookup error.
    }
  }, [service, open, supported, connectionId]);
  useEffect(() => {
    setPendingId(null);
    void refreshTransactionStatus();
    return () => {
      revision.current++;
    };
  }, [refreshTransactionStatus]);
  const transactionPending = open && pendingId === connectionId;
  useEffect(() => {
    if (!transactionPending) return;
    const interval = window.setInterval(
      () => void refreshTransactionStatus(),
      5000,
    );
    return () => window.clearInterval(interval);
  }, [transactionPending, refreshTransactionStatus]);
  return {
    manualTransaction: supported && !autoCommit,
    transactionPending,
    refreshTransactionStatus,
  };
}
