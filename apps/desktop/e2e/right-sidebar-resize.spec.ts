import { expect, type Page, test } from "@playwright/test";

// The right sidebar is a dockview panel with its sash on the left edge. When a
// command opens AI Chat the store asks for a comfortable width, and a manual
// sash drag has to keep the last word. Tauri `invoke` rejects here and the app
// falls back to its mock snapshot, which is enough to lay the panel out.

const bothSidebars = {
  "irodori.sidebar.open.v1": "true",
  "irodori.sidebar.right.open.v1": "true",
  "irodori.sidebar.width.v2": "300",
  "irodori.inspector.width.v1": "320",
};

async function openWorkbench(page: Page) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, value);
    }
  }, bothSidebars);
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
}

/** The vertical sash on the right sidebar's left edge. */
async function rightSidebarSash(page: Page, edge: number) {
  return page.evaluate((x) => {
    for (const element of document.querySelectorAll(".dv-sash.dv-enabled")) {
      const box = element.getBoundingClientRect();
      if (box.height > box.width && box.left - 1 <= x && x <= box.right + 1) {
        return { x: box.x + box.width / 2 };
      }
    }
    return null;
  }, edge);
}

test("widening the right sidebar keeps AI Chat usable", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 });
  await openWorkbench(page);

  const sidebar = page.locator("aside.sidebar-right");
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("tab", { name: "AI Chat" }).click();
  await expect(page.locator(".aichat-panel")).toBeVisible();

  const before = await sidebar.boundingBox();
  expect(before).not.toBeNull();
  const sash = await rightSidebarSash(page, before!.x);
  expect(sash, "no sash on the right sidebar's left edge").not.toBeNull();

  await page.mouse.move(sash!.x, 400);
  await page.mouse.down();
  // Moving left widens the right sidebar.
  await page.mouse.move(before!.x - 80, 400, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await sidebar.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width + 50);

  // The chat panel fills the widened panel and its input is not squeezed flat.
  const panel = page.locator(".aichat-panel");
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.width).toBeGreaterThanOrEqual(after!.width - 2);
  expect(
    (await panel.locator(".aichat-input textarea").boundingBox())?.width ?? 0,
  ).toBeGreaterThan(120);

  const stored = await page.evaluate(() =>
    Number(window.localStorage.getItem("irodori.inspector.width.v1")),
  );
  expect(stored).toBeCloseTo(after!.width, -1);
});
