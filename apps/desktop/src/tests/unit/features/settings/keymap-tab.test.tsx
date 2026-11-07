import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeymapTab } from "@/features/settings/tabs/KeymapTab";
import { createTranslator } from "@/i18n";
import { componentRenderer } from "@/tests/helpers/render";
import {
  keybindingScopes,
  type CommandMeta,
  type KeymapConflicts,
} from "@/core/keybindings";

const { t } = createTranslator("en");

const commandCatalog: CommandMeta[] = [
  { id: "query.run", title: "Run Query", category: "Query", scope: "editor" },
  { id: "query.all", title: "Run All", category: "Query", scope: "editor" },
];

const noConflicts = Object.fromEntries(
  keybindingScopes.map((scope) => [scope, {}]),
) as KeymapConflicts;

const renderTab = componentRenderer(
  KeymapTab,
  () =>
    ({
      t,
      commandCatalog,
      keymap: { "query.run": "Mod+Enter" },
      keymapOverrides: {},
      keymapConflicts: noConflicts,
      vimMode: false,
      vimKeymapConflicts: [],
      recordingCommand: null,
      recordingSequence: [],
      runCommand: vi.fn(),
      beginRecording: vi.fn(),
      resetKeybinding: vi.fn(),
      applyVimKeybindingResolutions: vi.fn(),
    }) satisfies Parameters<typeof KeymapTab>[0],
);

describe("KeymapTab discoverability", () => {
  it("shows a one-line instruction that the shortcuts are editable", () => {
    renderTab();
    expect(
      screen.getByText(
        "Select a shortcut to record a new key combination. Press Esc to cancel.",
      ),
    ).toBeVisible();
  });

  it("labels the bound chord as a control that changes the shortcut", () => {
    renderTab();
    // The accessible name says what the button does, not just the key combo —
    // that is the affordance a value-looking row was missing.
    const rebind = screen.getByRole("button", {
      name: "Change shortcut for Run Query",
    });
    expect(rebind).toBeVisible();
    expect(rebind).toHaveTextContent("Enter");
  });

  it("invites a click on an unbound row instead of showing a bare value", () => {
    renderTab();
    // "Run All" has no binding. It must read as a call to action, not "unset".
    const setShortcut = screen.getByRole("button", {
      name: "Change shortcut for Run All",
    });
    expect(setShortcut).toHaveTextContent("Set shortcut");
    expect(setShortcut.className).toContain("unset");
    expect(screen.queryByText("unset")).toBeNull();
  });

  it("records a rebind when the chord control is clicked", async () => {
    const { props, user } = renderTab();
    await user.click(
      screen.getByRole("button", { name: "Change shortcut for Run Query" }),
    );
    expect(props.beginRecording).toHaveBeenCalledWith("query.run");
  });

  it("filters by command name and reports the match count", async () => {
    const { user } = renderTab();
    await user.type(
      screen.getByRole("searchbox", { name: "Search shortcuts" }),
      "Run All",
    );
    expect(
      screen.queryByRole("button", { name: "Change shortcut for Run Query" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Change shortcut for Run All" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 shortcuts");
  });

  it("filters by key combination and restores the list when cleared", async () => {
    const { user } = renderTab();
    const search = screen.getByRole("searchbox", { name: "Search shortcuts" });
    await user.type(search, "Ctrl+Enter");
    expect(
      screen.getByRole("button", { name: "Change shortcut for Run Query" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Change shortcut for Run All" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Clear shortcut search" }),
    );
    expect(
      screen.getByRole("button", { name: "Change shortcut for Run All" }),
    ).toBeVisible();
  });

  it("shows an empty state when nothing matches", async () => {
    const { user } = renderTab();
    await user.type(
      screen.getByRole("searchbox", { name: "Search shortcuts" }),
      "nope",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No shortcuts match your search.",
    );
  });
});
