import { act, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionToast, useActionNotices } from "@/app/ActionToast";
import { usePreferencesStore } from "@/features/preferences";
import { renderUi } from "@/tests/helpers/render";

/**
 * The notice queue had no test. #117 added a `warning` kind to it, and the
 * whole point of that kind is its dismissal behaviour: a connector that can
 * return silently wrong rows must not have its caveat auto-scroll away after
 * three seconds.
 */

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useActionNotices dismissal", () => {
  it("auto-dismisses success and info notices", () => {
    const { result } = renderHook(() => useActionNotices());

    act(() => {
      result.current.showActionNotice("success", "Connected");
      result.current.showActionNotice("info", "Draft created");
    });
    expect(result.current.notices).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(result.current.notices).toHaveLength(0);
  });

  it("keeps warnings and errors until dismissed", () => {
    const { result } = renderHook(() => useActionNotices());

    act(() => {
      result.current.showActionNotice(
        "warning",
        "Hive results may be incorrect",
      );
      result.current.showActionNotice("error", "Connect failed");
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.notices).toHaveLength(2);

    act(() => {
      result.current.dismissNotice(result.current.notices[0].id);
    });
    expect(result.current.notices).toHaveLength(1);
  });

  it("caps the queue instead of growing without bound", () => {
    const { result } = renderHook(() => useActionNotices());

    act(() => {
      for (let index = 0; index < 8; index += 1) {
        result.current.showActionNotice("error", `Failure ${index}`);
      }
    });

    const notices = result.current.notices;
    expect(notices).toHaveLength(4);
    // Oldest dropped, newest kept.
    expect(notices[notices.length - 1]?.title).toBe("Failure 7");
  });
});

describe("ActionToast rendering", () => {
  it("announces a warning assertively, like an error", () => {
    vi.useRealTimers();
    renderUi(
      <ActionToast
        notice={{
          id: 1,
          kind: "warning",
          title: "Hive results may be incorrect",
          detail: "The connector ignores the metastore.",
        }}
        onDismiss={vi.fn()}
      />,
    );

    // A correctness caveat is worth interrupting a screen-reader user for; a
    // polite live region can be swallowed by whatever they are already reading.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveClass("warning");
    expect(alert).toHaveTextContent("Hive results may be incorrect");
  });

  it("announces success politely", () => {
    vi.useRealTimers();
    renderUi(
      <ActionToast
        notice={{ id: 2, kind: "success", title: "Connected" }}
        onDismiss={vi.fn()}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
