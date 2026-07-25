import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

export type ActionNoticeAction = {
  label: string;
  run: () => void;
};

export type ActionNotice = {
  id: number;
  kind: "success" | "warning" | "error" | "info";
  title: string;
  detail?: string;
  action?: ActionNoticeAction;
};

export type ShowActionNotice = (
  kind: ActionNotice["kind"],
  title: string,
  detail?: string,
  options?: { action?: ActionNoticeAction },
) => void;

const MAX_VISIBLE_NOTICES = 4;
// Errors and warnings stay until dismissed so neither a failure nor a
// correctness caveat can silently scroll away while the user is looking
// elsewhere; success/info auto-dismiss.
//
// `warning` exists separately from `error` because the operation succeeded —
// a Hive connection really did open (#117) — but its results cannot be trusted.
// Styling it as a failure would be wrong, and letting it auto-dismiss would
// reproduce the very problem it warns about.
const DISMISS_DELAY_MS: Record<ActionNotice["kind"], number | null> = {
  success: 3200,
  info: 3200,
  warning: null,
  error: null,
};

/**
 * Queue of workbench notifications. Notices stack (newest at the bottom)
 * instead of overwriting each other; the queue is capped so rapid failures
 * drop the oldest entry rather than growing without bound.
 */
export function useActionNotices() {
  const [notices, setNotices] = useState<ActionNotice[]>([]);
  const timersRef = useRef(new Map<number, number>());
  const nextIdRef = useRef(1);

  const clearTimer = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissNotice = useCallback(
    (id: number) => {
      clearTimer(id);
      setNotices((current) => current.filter((notice) => notice.id !== id));
    },
    [clearTimer],
  );

  const showActionNotice = useCallback<ShowActionNotice>(
    (kind, title, detail, options) => {
      const id = nextIdRef.current++;
      setNotices((current) => {
        const next = [
          ...current,
          { id, kind, title, detail, action: options?.action },
        ];
        const overflow = next.length - MAX_VISIBLE_NOTICES;
        if (overflow <= 0) {
          return next;
        }
        for (const dropped of next.slice(0, overflow)) {
          clearTimer(dropped.id);
        }
        return next.slice(overflow);
      });
      const delay = DISMISS_DELAY_MS[kind];
      if (delay !== null) {
        timersRef.current.set(
          id,
          window.setTimeout(() => dismissNotice(id), delay),
        );
      }
    },
    [clearTimer, dismissNotice],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return { notices, showActionNotice, dismissNotice };
}

export function ActionToast({
  notice,
  onDismiss,
}: {
  notice: ActionNotice;
  onDismiss: () => void;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  // Warnings are announced assertively too: a silently-wrong-results caveat is
  // worth interrupting for.
  const urgent = notice.kind === "error" || notice.kind === "warning";
  return (
    <div
      className={`action-toast ${notice.kind}`}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
    >
      <span className="action-toast-mark" aria-hidden="true" />
      <span>
        <strong>{notice.title}</strong>
        {notice.detail ? <small>{notice.detail}</small> : null}
      </span>
      <span className="action-toast-controls">
        {notice.action ? (
          <button
            type="button"
            className="action-toast-action"
            onClick={() => {
              notice.action?.run();
              onDismiss();
            }}
          >
            {notice.action.label}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t("notice.dismiss")}
          onClick={onDismiss}
        >
          <X size={13} />
        </button>
      </span>
    </div>
  );
}

export function ActionToastStack({
  notices,
  onDismiss,
}: {
  notices: readonly ActionNotice[];
  onDismiss: (id: number) => void;
}) {
  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="action-toast-stack">
      {notices.map((notice) => (
        <ActionToast
          key={notice.id}
          notice={notice}
          onDismiss={() => onDismiss(notice.id)}
        />
      ))}
    </div>
  );
}
