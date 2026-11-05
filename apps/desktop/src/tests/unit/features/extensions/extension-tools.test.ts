import { describe, expect, it } from "vitest";
import { withToolMenuItems } from "@/app/app-config";
import { canonicalKeySequence, resolveKeybinding } from "@/core";
import {
  decodeToolOutput,
  defaultToolValues,
  installedTools,
  isToolCommandId,
  localize,
  toolCommands,
  withToolShortcuts,
} from "@/features/extensions/tools/extension-tools";
import type { InstalledExtension } from "@/generated/irodori-api";

const tool = {
  id: "demo.tool",
  title: { en: "Demo", ja: "デモ" },
  shortcut: "Mod+Shift+M",
  form: {
    sections: [
      {
        columns: 3,
        fields: [
          {
            id: "engine",
            label: { en: "Engine" },
            type: "select",
            default: "b",
            options: [
              { value: "a", label: { en: "A" } },
              { value: "b", label: { en: "B" } },
            ],
          },
          { id: "limit", label: { en: "Limit" }, type: "number", default: 5 },
          { id: "keys", label: { en: "Keys" }, type: "lines", default: "x\ny" },
          { id: "flag", label: { en: "Flag" }, type: "boolean", default: true },
        ],
      },
    ],
  },
};

function extension(
  tools: unknown[],
  patch: Partial<InstalledExtension> = {},
): InstalledExtension {
  return {
    id: "irodori.demo",
    name: "Demo",
    version: "0.1.0",
    runtime: "native",
    hostFeatures: [],
    sha256: "a".repeat(64),
    enabled: true,
    installedAt: "0",
    supportedCalls: [],
    tools,
    ...patch,
  };
}

describe("installedTools", () => {
  it("reads a tool from what the extension declared", () => {
    const [decoded] = installedTools([extension([tool])]);

    expect(decoded?.extensionId).toBe("irodori.demo");
    expect(isToolCommandId(decoded!.commandId)).toBe(true);
    expect(decoded?.sections[0]?.columns).toBe(3);
    expect(decoded?.sections[0]?.fields.map((field) => field.type)).toEqual([
      "select",
      "number",
      "lines",
      "boolean",
    ]);
  });

  it("gives every field a value from the form's defaults", () => {
    const [decoded] = installedTools([extension([tool])]);

    expect(defaultToolValues(decoded!)).toEqual({
      engine: "b",
      limit: 5,
      keys: "x\ny",
      flag: true,
    });
  });

  it("ignores a disabled extension and one with no tools", () => {
    expect(
      installedTools([
        extension([tool], { enabled: false }),
        extension([], { id: "irodori.connector" }),
      ]),
    ).toEqual([]);
  });

  it("drops what a manifest gets wrong instead of showing it broken", () => {
    const badField = { id: "x", label: { en: "X" }, type: "script" };
    const noEnglish = { id: "y", label: { ja: "ワイ" }, type: "string" };
    const goodField = { id: "z", label: { en: "Z" }, type: "string" };

    const tools = installedTools([
      extension([
        "not an object",
        { id: "no-title", form: { sections: [{ fields: [goodField] }] } },
        { id: "no-form", title: { en: "T" } },
        { id: "empty", title: { en: "T" }, form: { sections: [] } },
        {
          id: "kept",
          title: { en: "T" },
          form: { sections: [{ fields: [badField, noEnglish, goodField] }] },
        },
      ]),
    ]);

    expect(tools.map((item) => item.id)).toEqual(["kept"]);
    expect(tools[0]?.sections[0]?.fields.map((field) => field.id)).toEqual([
      "z",
    ]);
  });

  it("keeps the column count within what the layout can show", () => {
    const field = { id: "z", label: { en: "Z" }, type: "string" };
    const columns = (value: unknown) =>
      installedTools([
        extension([
          {
            id: "t",
            title: { en: "T" },
            form: { sections: [{ columns: value, fields: [field] }] },
          },
        ]),
      ])[0]?.sections[0]?.columns;

    expect(columns(99)).toBe(4);
    expect(columns(0)).toBe(1);
    expect(columns("two")).toBe(1);
  });

  it("starts a select on its first option when its default is unusable", () => {
    const [decoded] = installedTools([
      extension([
        {
          id: "t",
          title: { en: "T" },
          form: {
            sections: [
              {
                fields: [
                  {
                    id: "s",
                    label: { en: "S" },
                    type: "select",
                    options: [{ value: "first", label: { en: "First" } }],
                  },
                ],
              },
            ],
          },
        },
      ]),
    ]);

    expect(defaultToolValues(decoded!)).toEqual({ s: "first" });
  });
});

describe("localize", () => {
  it("falls back on English", () => {
    expect(localize({ en: "Demo", ja: "デモ" }, "ja")).toBe("デモ");
    expect(localize({ en: "Demo" }, "ja")).toBe("Demo");
  });
});

describe("decodeToolOutput", () => {
  it("keeps tabs it understands and drops the rest", () => {
    const output = decodeToolOutput({
      title: "Plan",
      tabs: [
        {
          id: "o",
          title: "Overview",
          kind: "overview",
          text: "# Plan",
          metrics: [{ label: "Keys", value: "2" }],
          steps: [{ title: "Extract", detail: "d", level: "ready" }],
          notes: [
            { title: "Warnings", items: ["w", 3], tone: "warning" },
            { title: "Notes", items: ["n"] },
          ],
        },
        { id: "s", title: "SQL", kind: "code", text: "select 1" },
        { id: "h", title: "HTML", kind: "html", text: "<script>" },
        { title: "No id", kind: "text", text: "x" },
      ],
    });

    expect(output.title).toBe("Plan");
    expect(output.tabs.map((tab) => tab.id)).toEqual(["o", "s"]);
    expect(output.tabs[0]?.notes).toEqual([
      { title: "Warnings", items: ["w"], warning: true },
      { title: "Notes", items: ["n"], warning: false },
    ]);
  });

  it("gives nothing for a response that is not an output", () => {
    expect(decodeToolOutput(null)).toEqual({ title: "", tabs: [] });
    expect(decodeToolOutput({ tabs: "no" })).toEqual({ title: "", tabs: [] });
  });
});

describe("tool commands", () => {
  const tools = installedTools([extension([tool])]);
  const commandId = tools[0]!.commandId;

  it("appear under the title for the locale", () => {
    expect(toolCommands(tools, "ja")[0]).toMatchObject({
      id: commandId,
      title: "デモ",
      scope: "global",
    });
  });

  it("join the Tools menu and no other", () => {
    const sections = withToolMenuItems(
      [
        { label: "Edit", items: [{ commandId: "edit.undo" }] },
        { label: "Tools", items: [{ commandId: "settings.keymap" }] },
      ],
      [commandId],
    );

    expect(sections[0]?.items).toEqual([{ commandId: "edit.undo" }]);
    expect(sections[1]?.items).toEqual([
      { commandId },
      { commandId: "settings.keymap" },
    ]);
  });

  it("run from their shortcut", () => {
    const keymap = withToolShortcuts({}, tools, canonicalKeySequence);

    const resolution = resolveKeybinding({
      keymap,
      scope: "global",
      chord: canonicalKeySequence("Mod+Shift+M"),
      commands: toolCommands(tools, "en"),
    });

    expect(resolution).toMatchObject({ kind: "command", commandId });
  });

  it("cannot take a key the app or the user already has", () => {
    const keymap = withToolShortcuts(
      { "query.run": "Mod+Shift+M" },
      tools,
      canonicalKeySequence,
    );

    expect(keymap).toEqual({ "query.run": "Mod+Shift+M" });
  });
});
