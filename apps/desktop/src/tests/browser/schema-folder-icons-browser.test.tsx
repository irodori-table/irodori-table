import { afterEach, describe, expect, it } from "vitest";
import "@/App.css";

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.();
  }
});

function mountSchema(open: boolean) {
  const host = document.createElement("div");
  host.innerHTML = `
    <details class="schema-tree"${open ? " open" : ""}>
      <summary>
        <svg class="tree-chevron"></svg>
        <span class="schema-folder-icon">
          <svg class="schema-folder-closed"></svg>
          <svg class="schema-folder-open"></svg>
        </span>
        <span>public</span>
      </summary>
    </details>`;
  document.body.append(host);
  mounted.push(() => host.remove());
  return host;
}

function display(host: HTMLElement, selector: string) {
  return getComputedStyle(host.querySelector(selector)!).display;
}

describe("schema folder disclosure icons (real layout)", () => {
  it("shows the open folder and hides the closed one while expanded", () => {
    const host = mountSchema(true);
    expect(display(host, ".schema-folder-open")).not.toBe("none");
    expect(display(host, ".schema-folder-closed")).toBe("none");
  });

  it("shows the closed folder and hides the open one while collapsed", () => {
    const host = mountSchema(false);
    expect(display(host, ".schema-folder-closed")).not.toBe("none");
    expect(display(host, ".schema-folder-open")).toBe("none");
  });

  it("swaps the icons when the details element toggles", () => {
    const host = mountSchema(true);
    const details = host.querySelector("details")!;
    details.open = false;
    expect(display(host, ".schema-folder-closed")).not.toBe("none");
    details.open = true;
    expect(display(host, ".schema-folder-open")).not.toBe("none");
  });
});
