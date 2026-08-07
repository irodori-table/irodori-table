import { expect, test } from "@playwright/test";

// The run control sits at the bottom edge of .workbench-dock-panel.editor,
// which is overflow:hidden. Rendered in place, the options menu opened
// correctly by every state measure — aria-expanded true, opacity 1, z-index 25 —
// but its box began 3px below the panel's bottom edge, so the panel clipped
// every pixel and the caret looked dead. Asserting aria-expanded would not have
// caught it; this asserts what the user actually gets.
//
// #168 removed the `.run-menu-portal` wrapper this used to select. The wrapper
// was zero-size and the menu was placed relative to it by stylesheet rules, so
// the box being clamped was never the box on screen; the menu now carries its
// own resolved position and is the portaled element itself.
const menuSelector = ".run-menu-popover[role='menu']";

test("run options menu is visible and clickable, not clipped by the editor pane", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  await page.locator(".run-menu-toggle").first().click();

  const menu = page.locator(menuSelector);
  await expect(menu).toBeVisible();

  const clip = await page.evaluate((selector) => {
    const m = document.querySelector(selector) as HTMLElement | null;
    if (!m) return "NO_MENU";
    const r = m.getBoundingClientRect();
    let el: HTMLElement | null = m.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (s.overflow !== "visible") {
        const er = el.getBoundingClientRect();
        if (r.top >= er.bottom || r.bottom <= er.top) {
          return `clipped by ${el.className}`;
        }
      }
      el = el.parentElement;
    }
    return r.bottom > 0 && r.top < window.innerHeight ? "visible" : "offscreen";
  }, menuSelector);
  expect(clip).toBe("visible");

  await expect(menu.locator("[role='menuitem']").first()).toBeVisible();
});

// What the old wrapper made impossible to check, and what every comment in
// RunControl claimed was already true: the menu opens *above* the control, with
// their right edges aligned. With the wrapper it actually started at the
// control's top edge and ran downward and to the right (#168).
test("run options menu opens above the control, right edges aligned", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  await page.locator(".run-menu-toggle").first().click();
  await expect(page.locator(menuSelector)).toBeVisible();

  const geometry = await page.evaluate((selector) => {
    const menu = document.querySelector(selector) as HTMLElement | null;
    const control = document.querySelector(
      ".run-control",
    ) as HTMLElement | null;
    if (!menu || !control) return null;
    const m = menu.getBoundingClientRect();
    const c = control.getBoundingClientRect();
    return {
      opensUpward: m.bottom <= c.top,
      rightGap: Math.abs(m.right - c.right),
      insideViewport:
        m.left >= 0 &&
        m.top >= 0 &&
        m.right <= window.innerWidth &&
        m.bottom <= window.innerHeight,
    };
  }, menuSelector);

  expect(geometry).not.toBeNull();
  expect(geometry!.opensUpward).toBe(true);
  expect(geometry!.rightGap).toBeLessThan(2);
  expect(geometry!.insideViewport).toBe(true);
});
