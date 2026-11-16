/**
 * How long Connect and Test wait before giving up. An unreachable host
 * otherwise holds the dialog on "Connecting" until the operating system's TCP
 * connect timeout, which is minutes on Linux.
 */
export const connectionAttemptTimeoutMs = 10_000;

export type ConnectionAttemptOutcome<T> =
  | { kind: "done"; value: T }
  | { kind: "timeout" }
  | { kind: "cancelled" };

export type ConnectionAttempt<T> = {
  /**
   * Settles with the outcome. Rejects only when the work itself fails before
   * the attempt was given up on.
   */
  result: Promise<ConnectionAttemptOutcome<T>>;
  /** Give up now. A no-op once the attempt has settled. */
  cancel: () => void;
};

/**
 * Run one connect (or test) and stop waiting for it after a timeout or on
 * cancel.
 *
 * The backend call cannot be aborted from here, so giving up only frees the
 * UI: the work runs on. If it later succeeds, `onLateSuccess` receives its
 * value so the caller can close the connection nobody is waiting for; a late
 * failure is dropped, because it has already been reported as a timeout or a
 * cancellation.
 */
export function startConnectionAttempt<T>(
  run: () => Promise<T>,
  options: {
    timeoutMs?: number;
    onLateSuccess?: (value: T) => void;
  } = {},
): ConnectionAttempt<T> {
  const timeoutMs = options.timeoutMs ?? connectionAttemptTimeoutMs;
  let settled = false;
  let abandon: (outcome: ConnectionAttemptOutcome<T>) => void = () => {};

  const result = new Promise<ConnectionAttemptOutcome<T>>((resolve, reject) => {
    const timer = setTimeout(() => abandon({ kind: "timeout" }), timeoutMs);
    abandon = (outcome) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    Promise.resolve()
      .then(run)
      .then(
        (value) => {
          if (settled) {
            options.onLateSuccess?.(value);
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve({ kind: "done", value });
        },
        (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });

  return {
    result,
    cancel: () => abandon({ kind: "cancelled" }),
  };
}

/**
 * What outlives one render of the connection actions: the attempts that can
 * still be cancelled, and enough to tell whether a late success may be closed.
 */
export type ConnectionAttemptTracker = {
  pending: Set<ConnectionAttempt<unknown>>;
  /** Bumped per Connect, so a late success can see a newer attempt began. */
  generations: Map<string, number>;
  /** The latest connected ids, refreshed on every render. */
  connectedIds: { current: ReadonlySet<string> };
};

export function createConnectionAttemptTracker(): ConnectionAttemptTracker {
  return {
    pending: new Set(),
    generations: new Map(),
    connectedIds: { current: new Set() },
  };
}
