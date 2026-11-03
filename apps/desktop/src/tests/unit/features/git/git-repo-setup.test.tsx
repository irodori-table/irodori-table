// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { GitPanel } from "@/features/git/GitDrawer";
import { useGitStore } from "@/features/git/git-store";
import { usePreferencesStore } from "@/features/preferences";
import {
  gitDiff,
  gitInit,
  gitLog,
  gitStatus,
  type IrodoriError,
} from "@/generated/irodori-api";
import { renderUi } from "@/tests/helpers/render";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

vi.mock("@/generated/irodori-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/generated/irodori-api")>()),
  gitStatus: vi.fn(),
  gitLog: vi.fn(),
  gitDiff: vi.fn(),
  gitInit: vi.fn(),
}));

// A released build showed "default workspace is not a git repository: fatal:
// cannot change to '/home/runner/work/…'" in a red box: the backend fell back
// to the CI machine's checkout, and the panel treated "no repository yet" as a
// failure. No repository is the normal first-run state, so it must lead into
// setup, while real git failures still read as errors.

const repoPathStorageKey = "irodori.git.repoPath.v1";

function backendError(code: string, message: string): IrodoriError {
  return { kind: "notFound", message, code, retryable: false };
}

const loadedStatus = {
  repoRoot: "/home/me/project",
  branch: "main",
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  recentCommits: [],
  remotes: [],
  branches: [{ name: "main", current: true, ahead: 0, behind: 0 }],
};

describe("git panel repository setup", () => {
  const initial = useGitStore.getState();

  beforeEach(() => {
    usePreferencesStore.setState({ locale: "en" });
    window.localStorage.removeItem(repoPathStorageKey);
    useGitStore.setState({ ...initial, repoPath: "", repoPathDraft: "" });
    vi.mocked(gitDiff).mockResolvedValue({
      repoRoot: loadedStatus.repoRoot,
      staged: "",
      unstaged: "",
      truncated: false,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    window.localStorage.removeItem(repoPathStorageKey);
    useGitStore.setState(initial, true);
  });

  it("shows setup instead of an error when no repository is configured", async () => {
    const unconfigured = backendError(
      "git.repo.unconfigured",
      "no git repository is configured",
    );
    vi.mocked(gitStatus).mockRejectedValue(unconfigured);
    vi.mocked(gitLog).mockRejectedValue(unconfigured);

    const { container } = renderUi(<GitPanel variant="sidebar" />);

    expect(
      await screen.findByText(
        "Choose a Git repository to see its history and changes.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open repository…" }),
    ).toBeVisible();
    // Nothing was chosen, so there is no folder to initialize.
    expect(
      screen.queryByRole("button", { name: "Initialize repository here" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".git-error")).toBeNull();
    expect(screen.queryByText(/no git repository is configured/)).toBeNull();
  });

  it("remembers the folder picked from setup and loads it", async () => {
    const unconfigured = backendError(
      "git.repo.unconfigured",
      "no git repository is configured",
    );
    vi.mocked(gitStatus).mockRejectedValueOnce(unconfigured);
    vi.mocked(gitLog).mockRejectedValueOnce(unconfigured);
    vi.mocked(openDialog).mockResolvedValue("/home/me/project");

    const { user } = renderUi(<GitPanel variant="sidebar" />);
    const openButton = await screen.findByRole("button", {
      name: "Open repository…",
    });

    vi.mocked(gitStatus).mockResolvedValue(loadedStatus);
    vi.mocked(gitLog).mockResolvedValue([]);
    await user.click(openButton);

    await waitFor(() =>
      expect(gitStatus).toHaveBeenLastCalledWith("/home/me/project"),
    );
    expect(window.localStorage.getItem(repoPathStorageKey)).toBe(
      "/home/me/project",
    );
    expect(
      await screen.findByRole("combobox", { name: "Switch branch" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Open repository…" }),
    ).not.toBeInTheDocument();
  });

  it("offers to initialize a chosen folder that is not a repository", async () => {
    useGitStore.setState({
      repoPath: "/home/me/project",
      repoPathDraft: "/home/me/project",
    });
    const notRepository = backendError(
      "git.repo.notRepository",
      "/home/me/project is not a git repository",
    );
    vi.mocked(gitStatus).mockRejectedValueOnce(notRepository);
    vi.mocked(gitLog).mockRejectedValueOnce(notRepository);
    vi.mocked(gitInit).mockResolvedValue({
      repoRoot: "/home/me/project",
      stdout: "Initialized empty Git repository",
      stderr: "",
      statusCode: 0,
    });

    const { container, user } = renderUi(<GitPanel variant="sidebar" />);

    expect(
      await screen.findByText("This folder is not a Git repository."),
    ).toBeVisible();
    expect(screen.getByText("/home/me/project")).toBeVisible();
    expect(container.querySelector(".git-error")).toBeNull();

    vi.mocked(gitStatus).mockResolvedValue(loadedStatus);
    vi.mocked(gitLog).mockResolvedValue([]);
    await user.click(
      screen.getByRole("button", { name: "Initialize repository here" }),
    );
    // Creating a .git folder changes how every tool sees that folder, so it
    // is confirmed first.
    expect(gitInit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Initialize" }));

    await waitFor(() =>
      expect(gitInit).toHaveBeenCalledWith("/home/me/project"),
    );
    expect(
      await screen.findByRole("combobox", { name: "Switch branch" }),
    ).toBeVisible();
  });

  it("keeps a real git failure visible as an error", async () => {
    const failure: IrodoriError = {
      kind: "internal",
      message: "fatal: bad object HEAD",
      code: "git.exit.128",
      retryable: false,
    };
    vi.mocked(gitStatus).mockRejectedValue(failure);
    vi.mocked(gitLog).mockRejectedValue(failure);

    const { container } = renderUi(<GitPanel variant="sidebar" />);

    expect(await screen.findByText("fatal: bad object HEAD")).toBeVisible();
    expect(container.querySelector(".git-error")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open repository…" }),
    ).not.toBeInTheDocument();
  });
});
