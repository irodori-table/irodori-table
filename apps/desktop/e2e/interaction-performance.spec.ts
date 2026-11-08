import { expect, type Page, test } from "@playwright/test";

// Coarse, repeatable budgets for the interactions that used to feel heavy.
// They are deliberately generous: the point is to catch a stall regression
// (for example re-running a document-wide scan on every keystroke), not to
// micro-benchmark a runner. Numbers are logged as `PERF:` lines so a CI run
// records the current baseline.

async function openWorkbench(page: Page) {
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

function elapsed(start: number) {
  return Math.round(performance.now() - start);
}

test("opening Settings and switching sidebar views stays immediate", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openWorkbench(page);

  const settingsStart = elapsedStart();
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Settings/ }).click();
  await expect(page.locator(".settings-dialog")).toBeVisible();
  const settingsMs = elapsed(settingsStart);
  console.log(`PERF: settingsOpen=${settingsMs}ms`);
  expect(settingsMs).toBeLessThan(2_000);
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-dialog")).toHaveCount(0);

  const left = page.locator("aside.sidebar-left");
  const history = left.getByRole("tab", { name: "History" });
  const tables = left.getByRole("tab", { name: "Tables" });

  const switchStart = elapsedStart();
  await history.click();
  await expect(left.locator(".sidebar-panel")).toBeVisible();
  const historyMs = elapsed(switchStart);

  const backStart = elapsedStart();
  await tables.click();
  await expect(left.locator(".object-browser")).toBeVisible();
  const tablesMs = elapsed(backStart);
  console.log(`PERF: viewSwitch=${historyMs}ms/${tablesMs}ms`);
  expect(historyMs).toBeLessThan(1_000);
  expect(tablesMs).toBeLessThan(1_000);
});

function elapsedStart() {
  return performance.now();
}
