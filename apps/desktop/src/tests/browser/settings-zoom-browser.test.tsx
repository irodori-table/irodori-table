import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import "@/App.css";
import { GeneralTab } from "@/features/settings/tabs/GeneralTab";
import { createTranslator } from "@/i18n";

const { t } = createTranslator("en");

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function mountZoom() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [uiZoom, setUiZoom] = useState(1);
    return (
      <GeneralTab
        t={t}
        locale="en"
        setLocale={vi.fn()}
        uiZoom={uiZoom}
        setUiZoom={setUiZoom}
        vimMode={false}
        setVimMode={vi.fn()}
        editorBackgroundImage=""
        setEditorBackgroundImage={vi.fn()}
        editorBackgroundOpacity={0.08}
        setEditorBackgroundOpacity={vi.fn()}
        animationsEnabled
        setAnimationsEnabled={vi.fn()}
        sidebarViewLabels={false}
        setSidebarViewLabels={vi.fn()}
        problemsBadgeVisible
        setProblemsBadgeVisible={vi.fn()}
        autoCommit
        setAutoCommit={vi.fn()}
        updateCheckOnStartup
        setUpdateCheckOnStartup={vi.fn()}
        formatter="sql-formatter"
        setFormatter={vi.fn()}
        sqlLinter="gentle"
        setSqlLinter={vi.fn()}
        resultOffloadEnabled
        setResultOffloadEnabled={vi.fn()}
        resultMemoryBudget={20_000}
        setResultMemoryBudget={vi.fn()}
        queryHistoryMaxItems={100}
        setQueryHistoryMaxItems={vi.fn()}
        queryHistoryResultRows={50}
        setQueryHistoryResultRows={vi.fn()}
        sidebarOpen
        setSidebarOpen={vi.fn()}
        resetLayout={vi.fn()}
      />
    );
  }
  flushSync(() => root.render(<Harness />));
  cleanups.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

function percentField(host: HTMLElement) {
  return host.querySelector<HTMLInputElement>('input[type="number"]')!;
}

describe("zoom buttons with an uncommitted percentage", () => {
  it("applies the typed value and the increment on the first Zoom in click", async () => {
    const host = mountZoom();
    await page
      .getByRole("spinbutton", { name: "UI zoom percentage" })
      .fill("125");

    await page.getByRole("button", { name: "Zoom in", exact: true }).click();

    await expect.poll(() => percentField(host).value).toBe("135");
  });

  it("applies the typed value and the decrement on the first Zoom out click", async () => {
    const host = mountZoom();
    await page
      .getByRole("spinbutton", { name: "UI zoom percentage" })
      .fill("125");

    await page.getByRole("button", { name: "Zoom out", exact: true }).click();

    await expect.poll(() => percentField(host).value).toBe("115");
  });

  it("resets to 100% on the first click after typing a value", async () => {
    const host = mountZoom();
    await page
      .getByRole("spinbutton", { name: "UI zoom percentage" })
      .fill("125");

    await page.getByTitle("Reset zoom").click();

    await expect.poll(() => percentField(host).value).toBe("100");
  });

  it("ignores an invalid draft and applies the increment from the current value", async () => {
    const host = mountZoom();
    await page.getByRole("spinbutton", { name: "UI zoom percentage" }).fill("");

    await page.getByRole("button", { name: "Zoom in", exact: true }).click();

    await expect.poll(() => percentField(host).value).toBe("110");
  });
});
