import { describe, expect, it } from "vitest";
import { searchSettings } from "@/features/settings/settings-search";
import type { CommandMeta } from "@/core/keybindings";

const commands: CommandMeta[] = [
  { id: "query.run", title: "Run Query", category: "Query", scope: "editor" },
];

describe("searchSettings", () => {
  it("matches localized titles and descriptions case-insensitively", () => {
    const results = searchSettings("ZOOM", "en");
    expect(results.map((entry) => entry.id)).toContain("general.uiZoom");
  });

  it("normalizes full-width input", () => {
    const results = searchSettings("ＺＯＯＭ", "en");
    expect(results.map((entry) => entry.id)).toContain("general.uiZoom");
  });

  it("finds the Problems badge setting", () => {
    const results = searchSettings("problems badge", "en");
    expect(results.map((entry) => entry.id)).toContain("general.problemsBadge");
  });

  it("matches Japanese titles in the Japanese locale", () => {
    const results = searchSettings("ズーム", "ja");
    expect(results.map((entry) => entry.id)).toContain("general.uiZoom");
    expect(results[0]?.sectionLabel).toBe("一般");
  });

  it("matches every term across title, description, and section", () => {
    const results = searchSettings("general zoom", "en");
    expect(results.map((entry) => entry.id)).toContain("general.uiZoom");
  });

  it("includes matching shortcut commands with their section context", () => {
    const results = searchSettings("run query", "en", commands);
    expect(results).toContainEqual(
      expect.objectContaining({
        id: "keymap.query.run",
        section: "keymap",
        title: "Run Query",
      }),
    );
  });

  it("returns no results for a blank or unmatched query", () => {
    expect(searchSettings("   ", "en")).toEqual([]);
    expect(searchSettings("zzzz-not-a-setting", "en")).toEqual([]);
  });
});
