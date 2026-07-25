import { describe, expect, it } from "vitest";
import {
  engineCorrectnessWarning,
  enginesWithCorrectnessWarnings,
} from "@/features/connections";
import { createTranslator } from "@/i18n";

/**
 * #117: silently incorrect results are the worst failure mode a database
 * client has, so a connector that can return wrong rows has to say so on every
 * connect. These assertions pin *which* engines carry that warning, so an entry
 * cannot be dropped by accident while the connector is still broken, and a
 * fixed connector cannot keep scaring users after the fact.
 */

describe("engine correctness warnings", () => {
  it("warns for Hive, whose connector still ignores the metastore", () => {
    const warning = engineCorrectnessWarning("hive");

    expect(warning).not.toBeNull();
    const { t } = createTranslator("en");
    expect(t(warning!.titleKey)).toContain("incorrect");
    expect(t(warning!.detailKey)).toContain("metastore");
  });

  it("is translated in both shipped locales", () => {
    const warning = engineCorrectnessWarning("hive")!;

    const english = createTranslator("en").t(warning.detailKey);
    const japanese = createTranslator("ja").t(warning.detailKey);
    expect(japanese).not.toBe(english);
    expect(japanese).toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });

  // Hudi and Delta were fixed upstream (irodori-extension-hudi#6,
  // irodori-extension-delta-lake#6): they resolve the table snapshot properly
  // now, so warning about them would be wrong.
  it("does not warn for connectors that have been fixed", () => {
    expect(engineCorrectnessWarning("hudi")).toBeNull();
    expect(engineCorrectnessWarning("deltaLake")).toBeNull();
    expect(engineCorrectnessWarning("iceberg")).toBeNull();
  });

  it("does not warn for ordinary engines", () => {
    for (const engine of ["postgres", "mysql", "sqlite", "duckdb"]) {
      expect(engineCorrectnessWarning(engine), engine).toBeNull();
    }
  });

  it("tolerates missing, blank and differently-cased engine ids", () => {
    expect(engineCorrectnessWarning(null)).toBeNull();
    expect(engineCorrectnessWarning(undefined)).toBeNull();
    expect(engineCorrectnessWarning("")).toBeNull();
    expect(engineCorrectnessWarning("  HIVE  ")).not.toBeNull();
  });

  // The list is deliberately tiny. If it grows, that is a decision worth seeing
  // in a diff rather than something to discover in the UI.
  it("carries exactly the engines still known to be wrong", () => {
    expect([...enginesWithCorrectnessWarnings()].sort()).toEqual(["hive"]);
  });
});
