import { expect, test } from "@playwright/test";

// dockview's sashes sit at z-index 99 and used to compete with the app's
// layers on the root stacking context, above the modal scrim (--modal-z, 50):
// with a confirm dialog open, the resize line still drew across it and still
// took the pointer. Hit-testing follows paint order, so whatever
// elementFromPoint finds over a sash is what the pointer reaches there.
test("an open modal covers the dock's sashes", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
  await expect(page.locator(".cm-editor").first()).toBeVisible();

  const sashCount = await page.locator(".dv-sash.dv-enabled").count();
  expect(sashCount).toBeGreaterThan(0);

  // The rename prompt goes through the same DialogShell and .modal-overlay as
  // the delete-rows confirm, without needing a live result set.
  await page
    .getByRole("tab", { name: "scratch.sql" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename tab" }).click();
  await expect(
    page.getByRole("dialog", { name: "Rename SQL tab" }),
  ).toBeVisible();

  const hits = await page.evaluate(() =>
    [...document.querySelectorAll(".dv-sash.dv-enabled")].map((sash) => {
      const box = sash.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return hit?.closest(".modal-overlay") ? "overlay" : hit?.className;
    }),
  );
  expect(hits).toEqual(hits.map(() => "overlay"));
});
