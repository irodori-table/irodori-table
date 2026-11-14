import { expect, test } from "@playwright/test";
import {
  connectMockDatabase,
  installMultiResultMock,
  runFixtureQuery,
} from "./support/multi-result-mock";

test.setTimeout(60_000);

test("editing SQL does not reset a displayed single result's manual column width", async ({
  page,
}) => {
  await installMultiResultMock(page, { singleResult: true });
  await page.addInitScript(() => {
    const errors: string[] = [];
    (window as Window & { resizeErrors: string[] }).resizeErrors = errors;
    window.addEventListener("error", (event) => {
      if (event.message.includes("ResizeObserver loop"))
        errors.push(event.message);
    });
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 60_000 });
  await connectMockDatabase(page);
  await runFixtureQuery(page);
  const column = page.getByRole("columnheader", { name: "account_id" });
  const handle = column.locator(".column-resize-handle");
  const width = () =>
    column.evaluate((element) => element.getBoundingClientRect().width);
  const initial = await width();
  await handle.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(width).toBeGreaterThan(initial + 30);
  const resized = await width();

  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" -- still editing");
  await expect(page.locator(".cm-content")).toContainText("still editing");
  await expect.poll(width).toBe(resized);
  expect(
    await page.evaluate(
      () => (window as Window & { resizeErrors: string[] }).resizeErrors,
    ),
  ).toEqual([]);
});

test("F6 moves between visible dock panels without a missing-module error", async ({
  page,
}) => {
  const dockErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("dockview:"))
      dockErrors.push(message.text());
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator(".cm-content")).toBeVisible({ timeout: 60_000 });
  for (const side of ["left", "right"]) {
    const sidebar = page.locator(`aside.sidebar-${side}`);
    if (await sidebar.isVisible()) {
      await page
        .locator(`.titlebar-control-zone [data-sidebar-toggle="${side}"]`)
        .click();
      await expect(sidebar).not.toBeVisible();
    }
  }
  const focusedPanel = () =>
    page.evaluate(() =>
      document.activeElement
        ?.closest(".workbench-dock-panel")
        ?.getAttribute("class"),
    );
  await page.locator(".cm-content").click();
  await page.keyboard.press("F6");
  await expect.poll(focusedPanel).toContain("results");
  await page.keyboard.press("Shift+F6");
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect.poll(focusedPanel).toContain("results");
  await page.keyboard.press("F6");
  await expect(page.locator(".cm-content")).toBeFocused();
  expect(dockErrors).toEqual([]);
});
