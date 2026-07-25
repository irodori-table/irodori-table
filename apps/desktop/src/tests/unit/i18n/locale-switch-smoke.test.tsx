import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/app/CommandPalette";
import { ErrorDetails } from "@/components/ErrorDetails";
import { usePreferencesStore } from "@/features/preferences";
import { renderUi } from "@/tests/helpers/render";

function renderSmokeSurface() {
  return renderUi(
    <>
      <CommandPalette
        query=""
        commands={[]}
        keymap={{}}
        onQueryChange={vi.fn()}
        onRunCommand={vi.fn()}
        onClose={vi.fn()}
      />
      <ErrorDetails
        error={{
          kind: "timeout",
          message: "connect timed out after 30s",
          code: "ETIMEDOUT",
          retryable: true,
        }}
      />
    </>,
  );
}

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

afterEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("locale switch smoke", () => {
  it("walks shell and backend-error surfaces when switching to Japanese", () => {
    renderSmokeSurface();

    expect(screen.getByPlaceholderText("Search commands")).toBeVisible();
    expect(screen.getByText("No commands match")).toBeVisible();
    expect(screen.getByText("Timed out")).toBeVisible();
    expect(screen.getByText("Details")).toBeVisible();

    act(() => {
      usePreferencesStore.getState().setLocale("ja");
    });

    expect(screen.getByPlaceholderText("コマンドを検索")).toBeVisible();
    expect(screen.getByText("一致するコマンドはありません")).toBeVisible();
    expect(screen.getByText("タイムアウトしました")).toBeVisible();
    expect(screen.getByText("詳細")).toBeVisible();
    // The English strings are gone, not merely joined by Japanese ones.
    expect(
      screen.queryByPlaceholderText("Search commands"),
    ).not.toBeInTheDocument();
  });
});
