import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogMarksBar } from "@/features/query-editor/LogMarksBar";
import { usePreferencesStore } from "@/features/preferences";
import { componentRenderer } from "@/tests/helpers/render";

const renderBar = componentRenderer(LogMarksBar, () => ({
  marks: {},
  activeColor: "amber" as const,
  onActiveColorChange: vi.fn(),
  onMarkCurrentLine: vi.fn(),
  onJumpToLine: vi.fn(),
  onClearMarks: vi.fn(),
}));

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("LogMarksBar", () => {
  it("says so when nothing is marked, and offers no clear action", () => {
    renderBar();

    expect(screen.getByText("No marked lines")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Clear marks" }),
    ).not.toBeInTheDocument();
  });

  it("lists marked lines in file order, not string order", () => {
    renderBar({ marks: { 100: "amber", 9: "red", 21: "blue" } });

    const chips = screen
      .getByRole("list", { name: "Marked lines" })
      .querySelectorAll("button");
    expect([...chips].map((chip) => chip.textContent)).toEqual([
      "9",
      "21",
      "100",
    ]);
  });

  it("jumps to the line a chip names", async () => {
    const { user, props } = renderBar({ marks: { 42: "green" } });

    await user.click(screen.getByRole("button", { name: "Go to line 42" }));

    expect(props.onJumpToLine).toHaveBeenCalledWith(42);
  });

  it("reports the active colour through the radio group", async () => {
    const { user, props } = renderBar({ activeColor: "amber" });

    expect(screen.getByRole("radio", { name: "Amber" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Blue" }));

    expect(props.onActiveColorChange).toHaveBeenCalledWith("blue");
  });

  it("marks the current line and clears all marks", async () => {
    const { user, props } = renderBar({ marks: { 3: "amber" } });

    await user.click(screen.getByRole("button", { name: "Mark current line" }));
    expect(props.onMarkCurrentLine).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Clear marks" }));
    expect(props.onClearMarks).toHaveBeenCalledTimes(1);
  });

  it("reports the count", () => {
    renderBar({ marks: { 1: "amber", 2: "red" } });

    expect(screen.getByRole("status")).toHaveTextContent("2 marked");
  });

  it("renders in the active locale", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderBar({ marks: { 7: "amber" } });

    expect(
      screen.getByRole("button", { name: "7 行目へ移動" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 行マーク済み");
  });
});
