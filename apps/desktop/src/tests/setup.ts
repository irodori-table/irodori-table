import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach } from "vitest";

// Node 26 ships its own experimental `localStorage`/`sessionStorage` globals,
// which are `undefined` unless the process was started with
// `--localstorage-file`. Under the jsdom environment `window === globalThis`,
// so those Node accessors sit on the same object jsdom populates and win —
// `window.localStorage` reads as `undefined` and every web-storage test fails
// with "Cannot read properties of undefined (reading 'getItem')".
//
// Restore a real jsdom `Storage` (not a hand-rolled stand-in, so quota and
// key-coercion behaviour still match a browser) for any storage global the
// runtime left empty. Guarded so this becomes a no-op once Node or Vitest
// stops shadowing them.
function restoreWebStorage() {
  const storageKeys = ["localStorage", "sessionStorage"] as const;
  const missing = storageKeys.filter(
    (key) => (globalThis as Record<string, unknown>)[key] === undefined,
  );
  if (missing.length === 0) {
    return;
  }
  const dom = new JSDOM("", { url: "https://irodori.test/" });
  for (const key of missing) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
      writable: true,
    });
  }
}

restoreWebStorage();

// jsdom implements no layout, so it ships no `scrollIntoView` at all — calling
// it throws "not a function" rather than doing nothing. Components that keep an
// active item in view (EditorTabStrip, result grids) therefore cannot be
// rendered in a unit test without this. A no-op is the honest stand-in: jsdom
// has no scrollport to move, so only the browser suite can assert the outcome.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Vitest runs without `globals`, so Testing Library cannot find the `afterEach`
// it normally auto-registers cleanup on. Register it here, or every rendered
// tree — including anything portaled to <body> — leaks into the next test's
// `screen` queries.
afterEach(() => {
  cleanup();
});
