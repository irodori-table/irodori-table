import { expect, type Page, test } from "@playwright/test";

// Log-buffer filtering, marking, and profiles (issue #177, tiers 2-4). This drives the Vite
// frontend only: Tauri IPC is absent, `invoke` rejects, and the app falls back
// to its mock snapshot. Renaming a tab to `app.log` routes the buffer to the
// log language, which shows the filter bar above the editor.

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const logFixture = [
  "2026-07-18 10:00:00 INFO service started",
  "2026-07-18 10:00:01 DEBUG cache warmed",
  "2026-07-18 10:00:02 ERROR request failed",
  "    at example.handler (handler.js:10)",
  "2026-07-18 10:00:03 WARN slow response",
].join("\n");

async function openLogTab(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
  await expect(page.locator(".cm-editor").first()).toBeVisible();

  // Rename the active tab to a .log name via the tab context menu; the
  // rename prompt is a plain window.prompt.
  page.once("dialog", (dialog) => void dialog.accept("app.log"));
  await page
    .getByRole("tab", { name: "scratch.sql" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename tab" }).click();
  await expect(page.getByRole("group", { name: "Log filters" })).toBeVisible();

  // Replace the seeded SQL with the log fixture.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(logFixture);
  await expect(page.locator(".cm-content")).toContainText("service started");
}

test("level filter hides entries below the minimum, keeping stack traces", async ({
  page,
}) => {
  await openLogTab(page);

  await page.getByRole("button", { name: "ERROR" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("cache warmed");
  await expect(page.locator(".cm-content")).not.toContainText("slow response");
  await expect(page.locator(".cm-content")).toContainText("request failed");
  // The stack-trace continuation belongs to the ERROR entry and stays.
  await expect(page.locator(".cm-content")).toContainText("example.handler");
  await expect(page.getByText("3 lines hidden")).toBeVisible();

  // The document is untouched: select-all copy still yields every line.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(logFixture);

  await page.getByRole("button", { name: "Clear log filters" }).click();
  await expect(page.locator(".cm-content")).toContainText("cache warmed");
});

test("regex filter composes with the level filter and clears on Escape", async ({
  page,
}) => {
  await openLogTab(page);
  const pattern = page.getByRole("textbox", {
    name: "Filter log entries (regex)",
  });

  await pattern.fill("cache|slow");
  await expect(page.locator(".cm-content")).toContainText("cache warmed");
  await expect(page.locator(".cm-content")).toContainText("slow response");
  await expect(page.locator(".cm-content")).not.toContainText(
    "service started",
  );
  await expect(page.locator(".cm-content")).not.toContainText("request failed");
  await expect(page.getByText("3 lines hidden")).toBeVisible();

  // Composing with a minimum level of ERROR leaves nothing visible.
  await page.getByRole("button", { name: "ERROR" }).click();
  await expect(page.getByText("5 lines hidden")).toBeVisible();
  await expect(page.locator(".cm-content")).not.toContainText("cache warmed");

  // Escape clears the text filter only; the level filter stays put.
  await pattern.press("Escape");
  await expect(pattern).toHaveValue("");
  await expect(page.locator(".cm-content")).toContainText("request failed");
  await expect(page.getByText("3 lines hidden")).toBeVisible();
});

test("invalid regex is announced and continues as a literal filter", async ({
  page,
}) => {
  await openLogTab(page);
  const pattern = page.getByRole("textbox", {
    name: "Filter log entries (regex)",
  });

  await pattern.fill("handler (");
  await expect(pattern).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("status", {
      name: "Invalid regular expression; matching literal text instead",
    }),
  ).toBeVisible();
  // Invalid expressions fall back to literal text. The continuation match
  // keeps its whole ERROR entry, not just the matching stack-trace line.
  await expect(page.locator(".cm-content")).toContainText("request failed");
  await expect(page.locator(".cm-content")).toContainText("example.handler");
  await expect(page.locator(".cm-content")).not.toContainText(
    "service started",
  );
});

test("filters stay with their tab instead of leaking or resetting", async ({
  page,
}) => {
  await openLogTab(page);
  await page.getByRole("button", { name: "WARN" }).click();
  await page.getByRole("combobox", { name: "Profile" }).selectOption("jsonl");

  await page.getByRole("button", { name: "New SQL tab" }).click();
  const activeTab = page.locator(".editor-tab-strip .tab.active .tab-select");
  page.once("dialog", (dialog) => void dialog.accept("worker.log"));
  await activeTab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename tab" }).click();

  await expect(page.getByRole("button", { name: "All" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "Profile" })).toHaveValue(
    "auto",
  );
  await page.getByRole("tab", { name: "app.log" }).click();
  await expect(page.getByRole("button", { name: "WARN" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "Profile" })).toHaveValue(
    "jsonl",
  );
});

test("line marks recolour, compose with filters, and are pruned durably", async ({
  page,
}) => {
  await openLogTab(page);
  const content = page.locator(".cm-content");

  await page.locator(".cm-line").nth(1).click();
  await page.getByRole("radio", { name: "Red" }).click();
  await page.getByRole("button", { name: "Mark current line" }).click();
  await expect(
    page.getByRole("button", { name: "Go to line 2" }),
  ).toBeVisible();
  await expect(page.locator(".cm-line").nth(1)).toHaveClass(/cm-log-mark-red/);

  // A view-level filter hides the marked line without removing its mark.
  await page.getByRole("button", { name: "ERROR" }).click();
  await expect(content).not.toContainText("cache warmed");
  await expect(
    page.getByRole("button", { name: "Go to line 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear log filters" }).click();

  await page.getByRole("radio", { name: "Blue" }).click();
  await page.getByRole("button", { name: "Mark current line" }).click();
  await expect(page.locator(".cm-line").nth(1)).toHaveClass(/cm-log-mark-blue/);

  // Shortening the document past the marked line must also clear persistence;
  // otherwise the old mark would reappear when a rotated log grows again.
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("2026-07-18 10:00:00 INFO short log");
  await expect(page.getByRole("button", { name: "Go to line 2" })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(window.localStorage).some((key) =>
          key.startsWith("irodori.logMarks."),
        ),
      ),
    )
    .toBe(false);

  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(logFixture);
  await expect(page.getByRole("button", { name: "Go to line 2" })).toBeHidden();
});

test("a log profile creates queryable SQL without replacing the raw log", async ({
  page,
}) => {
  await openLogTab(page);

  await expect(
    page.getByRole("group", { name: "Log structure" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Profile" })).toHaveValue(
    "auto",
  );
  await page.getByRole("button", { name: "Create table SQL" }).click();

  const dialog = page.getByRole("dialog", { name: "Import preview" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("app.log · Common text")).toBeVisible();
  await expect(
    dialog.getByRole("columnheader", { name: "line", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("columnheader", { name: "timestamp" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("cell", { name: "service started", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".sql-preview")).toContainText(
    'CREATE TABLE IF NOT EXISTS "app"',
  );

  await dialog.getByRole("button", { name: "Open SQL in new tab" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".editor-tab-strip .tab.active")).toContainText(
    ".sql",
  );
  await expect(page.locator(".cm-content")).toContainText(
    'CREATE TABLE IF NOT EXISTS "app"',
  );

  // The generated SQL gets its own tab; returning to the source proves that
  // the import action did not destroy the raw log buffer.
  await page.getByRole("tab", { name: "app.log" }).click();
  await expect(page.locator(".cm-content")).toContainText("service started");
  await expect(page.locator(".cm-content")).not.toContainText(
    "CREATE TABLE IF NOT EXISTS",
  );
});

test("an incompatible explicit profile reports an error without opening a preview", async ({
  page,
}) => {
  await openLogTab(page);

  await page.getByRole("combobox", { name: "Profile" }).selectOption("jsonl");
  await page.getByRole("button", { name: "Create table SQL" }).click();

  await expect(page.locator(".action-toast.error")).toContainText(
    "Log parsing failed",
  );
  await expect(
    page.getByRole("dialog", { name: "Import preview" }),
  ).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("service started");
});

test("all log controls remain reachable at the minimum window with inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await openLogTab(page);
  await page.getByRole("button", { name: "WARN" }).click();
  await page.getByRole("button", { name: "Show right sidebar" }).click();
  await expect(
    page.getByRole("button", { name: "Hide right sidebar" }),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = document.querySelector(".log-filter-bar");
        if (!bar) return ["missing bar"];
        const bounds = bar.getBoundingClientRect();
        return Array.from(bar.children)
          .filter((child) => child.getBoundingClientRect().width > 0)
          .filter((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
          })
          .map((child) => child.className);
      }),
    )
    .toEqual([]);
  await expect(page.getByText("2 lines hidden")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear log filters" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create table SQL" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = document.querySelector(".log-profile-bar");
        if (!bar) return ["missing bar"];
        const bounds = bar.getBoundingClientRect();
        return Array.from(bar.children)
          .filter((child) => child.getBoundingClientRect().width > 0)
          .filter((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
          })
          .map((child) => child.className);
      }),
    )
    .toEqual([]);
  expect(
    await page.locator(".log-filter-bar").evaluate((bar) => bar.clientHeight),
  ).toBeGreaterThan(40);
});
