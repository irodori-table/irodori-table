import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("opens notebooks from File and the palette, reopens the saved file and preserves the SQL editor", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.locator(".cm-editor .cm-content").first();
  await editor.fill("select 'keep the editor buffer'");
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "SQL notebooks" }).click();
  const notebook = page.getByRole("dialog", { name: "SQL notebooks" });
  await notebook.getByRole("textbox", { name: "SQL cell 1" }).fill("select 1");
  await notebook.getByRole("button", { name: "Add Markdown cell" }).click();
  await notebook
    .getByRole("textbox", { name: "Markdown cell 2" })
    .fill("# Recheck");
  await notebook.getByRole("button", { name: "Add SQL cell" }).click();
  const lastCell = notebook.getByRole("textbox", { name: "SQL cell 3" });
  await lastCell.fill("select 2");
  const downloaded = page.waitForEvent("download");
  await lastCell.press("ControlOrMeta+s");
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("Notebook 1.irodori-notebook.json");
  const buffer = await readFile((await download.path())!);
  expect(JSON.parse(buffer.toString())).toEqual({
    version: 1,
    cells: [
      { type: "sql", source: "select 1" },
      { type: "markdown", source: "# Recheck" },
      { type: "sql", source: "select 2" },
    ],
  });
  await notebook.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).toHaveText("select 'keep the editor buffer'");
  await page.keyboard.press("ControlOrMeta+Shift+p");
  const palette = page.locator(".palette-input");
  await palette.fill("SQL notebooks");
  await palette.press("Enter");
  await expect(lastCell).toHaveValue("select 2");
  await notebook.locator("input[type=file]").setInputFiles({
    name: "review.irodori-notebook.json",
    mimeType: "application/json",
    buffer,
  });
  await expect(notebook.getByRole("tab", { name: "review" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    notebook.getByRole("textbox", { name: "Markdown cell 2" }),
  ).toHaveValue("# Recheck");
  await expect(notebook.getByRole("table")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveText("select 'keep the editor buffer'");
});
