import { describe, expect, it } from "vitest";
import { EngineIcon, hasEngineIcon } from "@/components/EngineIcon";
import { engineOptions } from "@/features/connections";
import { renderUi } from "@/tests/helpers/render";

/**
 * The assertions here are about which *glyph* rendered, which is a DOM-shape
 * question rather than a user-visible-text one — an icon has no accessible name
 * of its own. So this file still reaches for the container, but through the
 * shared render helper so cleanup and act() wrapping stay consistent with every
 * other component test (#172).
 */
function renderedSvg(engine: string): SVGSVGElement | null {
  const { container } = renderUi(<EngineIcon engine={engine} />);
  return container.querySelector("svg");
}

function svgClass(svg: SVGSVGElement | null): string {
  return svg?.getAttribute("class") ?? "";
}

describe("EngineIcon", () => {
  it("renders a brand mark (not a lucide glyph) for engines with a public-domain logo", () => {
    for (const engine of ["postgres", "mysql", "mongodb", "redis", "duckdb"]) {
      const svg = renderedSvg(engine);
      expect(svg, engine).not.toBeNull();
      expect(svgClass(svg), engine).not.toContain("lucide");
    }
  });

  it("falls back to a neutral lucide category glyph for trademark-strict engines", () => {
    // Oracle / SQL Server are deliberately absent from the CC0 brand set, so we
    // must not ship a look-alike — they render a neutral category glyph instead.
    for (const engine of ["oracle", "sqlserver", "redshift", "dynamodb"]) {
      const svg = renderedSvg(engine);
      expect(svg, engine).not.toBeNull();
      expect(svgClass(svg), engine).toContain("lucide");
    }
  });

  it("gives every shipped engine a mark of its own", () => {
    // The rail shows nothing but the icon, so an engine left on the generic
    // default reads to the user as "this connection has no icon".
    for (const option of engineOptions) {
      expect(hasEngineIcon(option.value), option.value).toBe(true);
    }
  });

  it("never reuses one glyph across two engines", () => {
    // MotherDuck is DuckDB-as-a-service and deliberately shares its mark.
    const sharedByDesign = new Set(["motherduck"]);
    const glyphByEngine = new Map<string, string>();
    for (const option of engineOptions) {
      if (sharedByDesign.has(option.value)) {
        continue;
      }
      const glyph = renderedSvg(option.value)?.innerHTML ?? "";
      expect(glyph, option.value).not.toBe("");
      const owner = glyphByEngine.get(glyph);
      expect(
        owner ?? option.value,
        `${option.value} reuses ${owner}'s glyph`,
      ).toBe(option.value);
      glyphByEngine.set(glyph, option.value);
    }
  });

  it("renders a default glyph for unknown engine ids without throwing", () => {
    const svg = renderedSvg("totally-unknown-engine-xyz");
    expect(svg).not.toBeNull();
    expect(svgClass(svg)).toContain("lucide");
  });

  it("renders brand marks monochrome (currentColor), never a hardcoded brand color", () => {
    const svg = renderedSvg("postgres");
    const fill = svg?.getAttribute("fill");
    // Forced to currentColor so the logo blends into the UI theme; must never be
    // a baked-in brand hex.
    expect(fill === null || fill === "currentColor").toBe(true);
    expect(fill ?? "").not.toMatch(/^#?[0-9a-fA-F]{6}$/);
  });
});
