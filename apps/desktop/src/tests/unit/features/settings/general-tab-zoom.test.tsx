import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeneralTab } from "@/features/settings/tabs/GeneralTab";
import { createTranslator } from "@/i18n";
import { componentRenderer } from "@/tests/helpers/render";

const { t } = createTranslator("en");

const renderTab = componentRenderer(
  GeneralTab,
  () =>
    ({
      t,
      locale: "en",
      setLocale: vi.fn(),
      uiZoom: 1,
      setUiZoom: vi.fn(),
      vimMode: false,
      setVimMode: vi.fn(),
      editorBackgroundImage: "",
      setEditorBackgroundImage: vi.fn(),
      editorBackgroundOpacity: 0.08,
      setEditorBackgroundOpacity: vi.fn(),
      animationsEnabled: true,
      setAnimationsEnabled: vi.fn(),
      sidebarViewLabels: false,
      setSidebarViewLabels: vi.fn(),
      problemsBadgeVisible: true,
      setProblemsBadgeVisible: vi.fn(),
      autoCommit: true,
      setAutoCommit: vi.fn(),
      updateCheckOnStartup: true,
      setUpdateCheckOnStartup: vi.fn(),
      formatter: "sql-formatter",
      setFormatter: vi.fn(),
      sqlLinter: "gentle",
      setSqlLinter: vi.fn(),
      resultOffloadEnabled: true,
      setResultOffloadEnabled: vi.fn(),
      resultMemoryBudget: 20_000,
      setResultMemoryBudget: vi.fn(),
      queryHistoryMaxItems: 100,
      setQueryHistoryMaxItems: vi.fn(),
      queryHistoryResultRows: 50,
      setQueryHistoryResultRows: vi.fn(),
      sidebarOpen: true,
      setSidebarOpen: vi.fn(),
      resetLayout: vi.fn(),
    }) satisfies Parameters<typeof GeneralTab>[0],
);

describe("GeneralTab UI zoom", () => {
  it("centers 100% on the slider track", () => {
    renderTab();
    expect(screen.getByRole("slider", { name: "UI zoom" })).toHaveValue("50");
  });

  it("commits a typed percentage on Enter", async () => {
    const { props, user } = renderTab();
    const field = screen.getByRole("spinbutton", {
      name: "UI zoom percentage",
    });
    await user.clear(field);
    await user.type(field, "125{Enter}");
    expect(props.setUiZoom).toHaveBeenCalledWith(1.25);
  });

  it("leaves the zoom unchanged for blank input", async () => {
    const { props, user } = renderTab();
    const field = screen.getByRole("spinbutton", {
      name: "UI zoom percentage",
    });
    await user.clear(field);
    await user.tab();
    expect(props.setUiZoom).not.toHaveBeenCalled();
  });
});
