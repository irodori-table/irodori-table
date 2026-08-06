import { describe, expect, it } from "vitest";
import { appCommandCatalog } from "@/app/app-config";
import {
  commandsAvailableForHostFeatures,
  hostFeatureCommandIds,
  hostFeatureForCommand,
} from "@/features/extensions/host-feature-commands";
import { hostFeatureIds } from "@/features/extensions/runtime-store";

/**
 * The palette filter used to be an inline `command.id !== "view.knowledge.
 * toggle"` check inside WorkbenchDialogs (#196/#197), which no test could
 * reach and which the next host feature would have had to remember to extend.
 */
describe("commands gated on a host feature", () => {
  it("gates exactly the Knowledge toggle today", () => {
    // Deliberately exact: when a host feature gains or loses a command this
    // test must be updated, which is the moment to check the palette filter
    // still matches the feature set.
    expect(hostFeatureCommandIds()).toEqual(["view.knowledge.toggle"]);
  });

  it("names commands that exist and features that exist", () => {
    const catalogIds = new Set(appCommandCatalog.map((command) => command.id));
    for (const commandId of hostFeatureCommandIds()) {
      expect(catalogIds).toContain(commandId);
      const feature = hostFeatureForCommand(commandId);
      expect(feature).not.toBeNull();
      expect(hostFeatureIds).toContain(feature);
    }
  });

  it("treats an ungated command as always available", () => {
    expect(hostFeatureForCommand("view.zoomIn")).toBeNull();
  });

  it("drops a gated command when its feature is not enabled", () => {
    const filtered = commandsAvailableForHostFeatures(appCommandCatalog, []);

    expect(filtered.map((command) => command.id)).not.toContain(
      "view.knowledge.toggle",
    );
    // Only the gated command goes; nothing else is collateral.
    expect(filtered).toHaveLength(appCommandCatalog.length - 1);
  });

  it("keeps a gated command when its feature is enabled", () => {
    const filtered = commandsAvailableForHostFeatures(appCommandCatalog, [
      "knowledge",
    ]);

    expect(filtered.map((command) => command.id)).toContain(
      "view.knowledge.toggle",
    );
    expect(filtered).toHaveLength(appCommandCatalog.length);
  });

  it("does not let an unrelated feature unlock a gated command", () => {
    const filtered = commandsAvailableForHostFeatures(appCommandCatalog, [
      "datalake",
    ]);

    expect(filtered.map((command) => command.id)).not.toContain(
      "view.knowledge.toggle",
    );
  });

  it("preserves catalog order", () => {
    const filtered = commandsAvailableForHostFeatures(appCommandCatalog, [
      "knowledge",
    ]);

    expect(filtered.map((command) => command.id)).toEqual(
      appCommandCatalog.map((command) => command.id),
    );
  });
});
