// @vitest-environment jsdom

import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitPanel } from "@/features/git/GitDrawer";
import { useGitStore } from "@/features/git/git-store";
import { usePreferencesStore } from "@/features/preferences";
import { keyMessage, textMessage } from "@/core";
import { renderUi } from "@/tests/helpers/render";

/**
 * #135: the Git panel's eight validation errors were emitted as English string
 * literals from the store. Error strings are the worst place to lose i18n,
 * because they appear when the user is already blocked.
 *
 * The store now carries a {key, values} message and the panel resolves it, so
 * the text follows the language — including when the language changes while the
 * error is already on screen, which a store that resolved once could not do.
 */

const initial = useGitStore.getState();

function gitState(overrides: Partial<ReturnType<typeof useGitStore.getState>>) {
  useGitStore.setState({
    ...initial,
    loading: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    status: {
      repoRoot: "/tmp/repo",
      branch: "main",
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      clean: true,
      files: [],
      recentCommits: [],
      remotes: [],
      branches: [{ name: "main", upstream: "origin/main" }],
    } as never,
    ...overrides,
  });
}

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("git panel error localization", () => {
  it("renders a validation error in the active locale", () => {
    usePreferencesStore.setState({ locale: "ja" });
    gitState({ error: keyMessage("git.error.commitMessageRequired") });

    renderUi(<GitPanel />);

    expect(
      screen.getByText("コミットメッセージを入力してください"),
    ).toBeVisible();
    expect(
      screen.queryByText("Commit message is required"),
    ).not.toBeInTheDocument();
  });

  // The reason the store carries a key instead of a resolved string: a string
  // frozen at throw time stays in the old language when the user switches.
  it("re-resolves an on-screen error when the language changes", () => {
    gitState({ error: keyMessage("git.error.branchNameRequired") });

    renderUi(<GitPanel />);
    expect(screen.getByText("Branch name is required")).toBeVisible();

    act(() => {
      usePreferencesStore.setState({ locale: "ja" });
    });

    expect(screen.getByText("ブランチ名を入力してください")).toBeVisible();
    expect(
      screen.queryByText("Branch name is required"),
    ).not.toBeInTheDocument();
  });

  // git itself speaks whatever locale the binary was built for; passing its
  // output through a translation table would mangle it.
  it("shows a message from git verbatim", () => {
    usePreferencesStore.setState({ locale: "ja" });
    gitState({
      error: textMessage("fatal: not a git repository (or any parent up to /)"),
    });

    renderUi(<GitPanel />);

    expect(
      screen.getByText("fatal: not a git repository (or any parent up to /)"),
    ).toBeVisible();
  });

  it("renders no error region when there is no error", () => {
    gitState({ error: null });

    const { container } = renderUi(<GitPanel />);

    expect(container.querySelector(".git-error")).toBeNull();
  });
});
