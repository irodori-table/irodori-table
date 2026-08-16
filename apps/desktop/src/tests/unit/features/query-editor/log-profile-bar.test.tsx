import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogProfileBar } from "@/features/query-editor/LogProfileBar";
import { usePreferencesStore } from "@/features/preferences";
import { componentRenderer } from "@/tests/helpers/render";

const renderBar = componentRenderer(LogProfileBar, () => ({
  profileId: "auto" as const,
  hasContent: true,
  onProfileChange: vi.fn(),
  onCreateTable: vi.fn(),
}));

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("LogProfileBar", () => {
  it("offers the built-in profiles with accessible labels", () => {
    renderBar();

    expect(screen.getByRole("group", { name: "Log structure" })).toBeVisible();
    const profile = screen.getByRole("combobox", { name: "Profile" });
    expect(profile).toHaveValue("auto");
    expect(
      [...profile.querySelectorAll("option")].map(
        (option) => option.textContent,
      ),
    ).toEqual(["Auto detect", "Common text", "JSON Lines"]);
  });

  it("changes profile and starts a table preview", async () => {
    const { user, props } = renderBar();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Profile" }),
      "jsonl",
    );
    expect(props.onProfileChange).toHaveBeenCalledWith("jsonl");

    await user.click(screen.getByRole("button", { name: "Create table SQL" }));
    expect(props.onCreateTable).toHaveBeenCalledTimes(1);
  });

  it("cannot create a table from an empty buffer", () => {
    renderBar({ hasContent: false });

    expect(
      screen.getByRole("button", { name: "Create table SQL" }),
    ).toBeDisabled();
  });

  it("renders in Japanese", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderBar({ profileId: "common" });

    expect(screen.getByRole("group", { name: "ログ構造化" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "プロファイル" })).toHaveValue(
      "common",
    );
    expect(
      screen.getByRole("button", { name: "テーブル SQL を作成" }),
    ).toBeVisible();
  });
});
