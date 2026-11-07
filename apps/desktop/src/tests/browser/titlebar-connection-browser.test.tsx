import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

function mountConnection(width = 320) {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  Object.assign(shell.style, { position: "fixed", left: "0px", top: "0px" });
  shell.innerHTML = `
    <header class="titlebar">
      <button class="connection-select titlebar-connection" type="button" style="width:${width}px">
        <span class="connection-color-dot" aria-hidden="true"></span>
        <span>Analytics Warehouse Production</span>
        <small>PostgreSQL 17.4 with pgvector and a very long server description</small>
        <svg></svg>
      </button>
    </header>`;
  document.body.append(shell);
  mounted.push(() => shell.remove());

  const button = shell.querySelector<HTMLElement>(".titlebar-connection")!;
  return {
    button,
    name: button.querySelectorAll<HTMLElement>("span")[1]!,
    detail: button.querySelector<HTMLElement>("small")!,
  };
}

describe("titlebar connection stacking (real layout)", () => {
  it("keeps the name in front of the server detail", () => {
    const { button, name, detail } = mountConnection();

    expect(getComputedStyle(button).isolation).toBe("isolate");
    expect(getComputedStyle(button).overflow).toBe("hidden");
    expect(getComputedStyle(name).zIndex).toBe("1");
    expect(getComputedStyle(detail).zIndex).toBe("0");
  });

  it("gives the name width priority and truncates the detail first", () => {
    const { name, detail } = mountConnection();

    expect(detail.scrollWidth).toBeGreaterThan(detail.clientWidth);
    expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
      detail.getBoundingClientRect().left + 1,
    );
  });
});
