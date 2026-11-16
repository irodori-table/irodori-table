import { expect, test } from "@playwright/test";
import {
  connectMockDatabase,
  installMultiResultMock,
  runFixtureQuery,
} from "./support/multi-result-mock";

// Dragging the sidebar edge shook: every frame of the drag alternated between
// the dragged width and the width from before the drag, and on release the
// sidebar could land back where it started. The workbench re-renders while
// the panels resize, and each re-render handed dockview a fresh
// `getTabContextMenuItems` function. Dockview treats a changed option as a
// reason to relay the grid out from the proportions it saved before the drag.
test("dragging the sidebar edge widens it smoothly and keeps the width", async ({
  page,
}) => {
  await installMultiResultMock(page);
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("sidebar-drag-seeded")) {
      window.localStorage.setItem("irodori.sidebar.width.v2", "300");
      window.sessionStorage.setItem("sidebar-drag-seeded", "1");
    }
  });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
  await connectMockDatabase(page);
  // Results in the dock make the workbench re-render as the panels resize.
  await runFixtureQuery(page);

  const sidebar = page.locator(".workbench-dock-panel.leftSidebar");
  const start = await sidebar.boundingBox();
  expect(start).not.toBeNull();
  const edge = start!.x + start!.width;
  const sashes = await page.locator(".dv-sash").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  const sash = sashes.find(
    (box) =>
      box.height > box.width && Math.abs(box.x + box.width / 2 - edge) < 8,
  );
  expect(sash, "the sidebar's own sash").toBeDefined();

  await page.evaluate(() => {
    const samples: number[] = [];
    const record = () => {
      const panel = document.querySelector(".workbench-dock-panel.leftSidebar");
      if (panel) {
        samples.push(Math.round(panel.getBoundingClientRect().width));
      }
      if ((window as { __sashSamples?: number[] }).__sashSamples) {
        requestAnimationFrame(record);
      }
    };
    (window as { __sashSamples?: number[] }).__sashSamples = samples;
    requestAnimationFrame(record);
  });

  const x = sash!.x + sash!.width / 2;
  const y = sash!.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 40; step += 1) {
    await page.mouse.move(x + step * 5, y);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const samples = await page.evaluate(() => {
    const recorded =
      (window as { __sashSamples?: number[] }).__sashSamples ?? [];
    delete (window as { __sashSamples?: number[] }).__sashSamples;
    return recorded;
  });
  // A rightward drag only ever widens the sidebar; a shrink between two
  // samples is the snap back to the pre-drag width.
  const shrinks = samples.filter(
    (width, index) => index > 0 && width < samples[index - 1]! - 1,
  );
  expect(shrinks, `widths: ${samples.join(",")}`).toEqual([]);

  const end = await sidebar.boundingBox();
  expect(end!.width).toBeGreaterThan(start!.width + 150);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(window.localStorage.getItem("irodori.sidebar.width.v2")),
      ),
    )
    .toBeGreaterThan(start!.width + 150);
});
