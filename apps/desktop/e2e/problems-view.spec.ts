import { expect, test } from "@playwright/test";

// Problems reads the same bounded SQL linter the editor uses, so a plain
// browser (Tauri invoke falls back to the mock snapshot) is enough to prove
// the list, the badge, and navigation back to the offending line.

test("Problems lists a lint error and opens its line", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("select (1");
  const editorText = async () =>
    (await page.locator(".cm-line").allTextContents()).join("\n");
  await expect.poll(editorText).toBe("select (1");

  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: /Toggle Problems Panel/ }).click();

  const panel = page.locator(".problems-panel");
  await expect(panel).toBeVisible();

  const item = panel.getByRole("button", {
    name: /Unclosed opening parenthesis/,
  });
  await expect(item).toBeVisible();
  await expect(panel.getByText("scratch.sql:1:8")).toBeVisible();

  const tab = page.getByRole("tab", { name: "Problems" });
  await expect(tab).toBeVisible();
  await expect(tab.locator(".sidebar-view-badge")).toBeVisible();

  await item.click();
  await expect(page.locator(".cm-content")).toBeFocused();
});
