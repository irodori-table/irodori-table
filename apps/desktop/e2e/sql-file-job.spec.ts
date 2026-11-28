import { expect, test } from "@playwright/test";
import { connectMockDatabase } from "./support/multi-result-mock";

test("Run SQL File keeps the current editor and opens Jobs", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const id = "scratch-db";
    window.localStorage.setItem(
      "irodori.connectionProfiles.v1",
      JSON.stringify([
        { id, name: "Scratch", engine: "sqlite", database: "scratch.db" },
      ]),
    );
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        switch (command) {
          case "workspace_snapshot":
            return {
              activeConnectionId: id,
              connections: [
                {
                  id,
                  name: "Scratch",
                  engine: "SQLite",
                  status: "idle",
                  latencyMs: 0,
                  proxy: "direct",
                  objects: [],
                },
              ],
            };
          case "db_connect":
            return { id, engine: "sqlite", serverVersion: "3" };
          case "db_list_objects":
            return { schemas: [] };
          case "db_pick_sql_file":
            return {
              token: "pick",
              name: "restore.sql",
              database: "scratch.db",
              size: 100000,
              previewBytes: 4096,
              preview: "CREATE TABLE restored(id);",
            };
          case "db_finish_sql_file":
            if (args?.run && args.connectionId === id && args.token === "pick")
              return "job-1";
            throw new Error("Unexpected file or connection");
          case "jobs_list":
            return { active: [], history: [] };
          default:
            return null;
        }
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
  });
  await page.goto("/");
  await connectMockDatabase(page);
  const editor = page.locator(".cm-content").first();
  const draft = "select 'my unsaved query';";
  await editor.fill(draft);
  await page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "Run", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Run SQL File…" }).click();
  await page.getByRole("button", { name: "Choose SQL file…" }).click();
  await expect(page.getByText("CREATE TABLE restored(id);")).toBeVisible();
  await page.getByRole("button", { name: "Run file", exact: true }).click();
  await expect(page.locator(".settings-jobs")).toBeVisible();
  await expect(editor).toHaveText(draft);
});
