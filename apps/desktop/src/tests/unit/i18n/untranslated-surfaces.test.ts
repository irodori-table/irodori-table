import { describe, expect, it } from "vitest";

/**
 * Guards the failure mode behind #133: a whole dialog written with no `t()`
 * call anywhere. Nothing caught that before — the locale files stay at key
 * parity because the surface never asks for a translation in the first place,
 * so a parity check reports success while ~110 strings render in English under
 * `ja`.
 *
 * Two independent checks:
 *
 * 1. every dialog/panel that renders user-visible chrome imports i18n at all;
 * 2. no user-facing text attribute (`title`, `aria-label`, `placeholder`) is a
 *    bare string literal.
 *
 * Both compare against an explicit baseline of what is still outstanding
 * (tracked in #170, the i18n sweep issue) rather than asserting empty. The
 * comparison is exact in both directions on purpose: a new bypass fails the
 * test, and *fixing* one also fails it until the entry is deleted here, so the
 * baseline can only shrink deliberately and never silently absorb a regression.
 *
 * Both are textual scans. `tsgo` (TypeScript 7) exposes no JS AST API, so there
 * is no parser to borrow — the same constraint `translation-placeholders.test.ts`
 * documents.
 */

const sources = import.meta.glob<string>(
  ["../../../**/*.tsx", "!../../../tests/**", "!../../../generated/**"],
  { query: "?raw", import: "default", eager: true },
);

/** `src/`-relative path, e.g. `features/import/ImportDialog.tsx`. */
function relativePath(globPath: string): string {
  return globPath.replace(/^(?:\.\.\/)+/, "");
}

/** Components with no user-visible text of their own. */
const NO_OWN_TEXT = new Set<string>(["main.tsx", "App.tsx"]);

/**
 * Attributes whose value reaches a user — visually or through a screen reader.
 * `aria-label` matters most: it is invisible in review, so an English one in a
 * Japanese UI survives every visual check.
 */
const TEXT_ATTRIBUTES = ["title", "aria-label", "placeholder"];

/**
 * Values that are not prose: SQL keywords, format names, symbols, and short
 * lowercase type tokens the app deliberately shows verbatim in both languages.
 */
const NOT_PROSE = /^(?:[\W\d]*|[A-Z][A-Z0-9_ ]*|[a-z_]+(?:_[a-z]+)*)$/;

/**
 * Dialogs and panels that still contain no `t()` call at all. #133 cleared
 * SchemaDesignerDialog, SchemaDiagramDialog, ImportDialog and
 * SearchReplacePanel; these three are what remains.
 */
const PANELS_WITHOUT_I18N = [
  "features/results/components/BiPanel.tsx",
  "features/workbench/components/LakehousePanel.tsx",
  "features/workbench/components/PlanPanel.tsx",
];

/**
 * Hardcoded `title`/`aria-label`/`placeholder` values that have not been swept
 * yet. Each one renders in English regardless of the app language.
 *
 * Keyed by file and value, deliberately without a line number: a baseline that
 * pins line numbers breaks on any unrelated edit above an entry, and the
 * failure says nothing about what actually changed.
 */
const HARDCODED_TEXT_ATTRIBUTES = [
  'components/ColorPicker.tsx aria-label="Saturation and brightness"',
  'components/ColorPicker.tsx aria-label="Hue"',
  'components/ColorPicker.tsx aria-label="Hex color"',
  'components/ColorPicker.tsx title="Remove"',
  'components/ColorPicker.tsx aria-label="Add current color to custom palette"',
  'components/ColorPicker.tsx title="Add current color"',
  'features/ai/AiGenerateDialog.tsx placeholder="sk-… (kept in memory only)"',
  'features/ai/AiGenerateDialog.tsx placeholder="-p   (use {prompt} as a placeholder, else prompt is piped to stdin)"',
  'features/ai/chat/ProviderPicker.tsx placeholder="https://api.openai.com"',
  'features/ai/chat/ProviderPicker.tsx placeholder="-p  (or use {prompt})"',
  'features/erd/erd-svg.tsx aria-label="Entity relationship diagram"',
  'features/git/GitDrawer.tsx placeholder="new-branch"',
  'features/query-editor/EditorSplitLayout.tsx aria-label="Resize editor split"',
  'features/query-editor/MetadataToolWindow.tsx aria-label="Find tool window"',
  'features/query-editor/MetadataToolWindow.tsx title="Edit Source"',
  'features/query-editor/MetadataToolWindow.tsx aria-label="Edit Source"',
  'features/query-editor/MetadataToolWindow.tsx title="Close"',
  'features/query-editor/MetadataToolWindow.tsx aria-label="Close"',
  'features/query-editor/QueryEditorPane.tsx aria-label="SQL query actions"',
  'features/results/components/BiPanel.tsx title="Close BI"',
  'features/results/components/BiPanel.tsx aria-label="Close BI"',
  'features/results/components/BiPanel.tsx aria-label="BI result summary"',
  'features/results/components/BiPanel.tsx aria-label="BI fields"',
  'features/results/components/ChartResultView.tsx aria-label="Chart window"',
  'features/results/components/ChartResultView.tsx aria-label="Chart type"',
  'features/results/components/ChartResultView.tsx title="Series color"',
  'features/results/components/ChartResultView.tsx title="Reset to theme color"',
  'features/results/components/ChartResultView.tsx aria-label="Reset series color"',
  'features/results/components/ChartResultView.tsx title="Open chart window"',
  'features/results/components/GraphResultView.tsx aria-label="Query result graph"',
  'features/workbench/components/Inspector.tsx aria-label="Close completion"',
  'features/workbench/components/Inspector.tsx title="Close completion"',
  'features/workbench/components/Inspector.tsx aria-label="Close completion"',
  'features/workbench/components/Inspector.tsx title="Close completion"',
  'features/workbench/components/Inspector.tsx aria-label="Loading metadata"',
  'features/workbench/components/LakehousePanel.tsx aria-label="Lakehouse"',
  'features/workbench/components/LakehousePanel.tsx title="Close Lakehouse"',
  'features/workbench/components/LakehousePanel.tsx aria-label="Close Lakehouse"',
  'features/workbench/components/PlanPanel.tsx aria-label="Explain plan"',
  'features/workbench/components/PlanPanel.tsx title="Close Plan"',
  'features/workbench/components/PlanPanel.tsx aria-label="Close Plan"',
  'features/workbench/components/PlanPanel.tsx title="Explain Plan"',
  'features/workbench/components/PlanPanel.tsx title="Explain Analyse"',
  'features/workbench/components/plan-panel/PlanAiExplanation.tsx aria-label="Explain this query plan with AI"',
  'features/workbench/components/plan-panel/PlanAnalysis.tsx aria-label="Plan analysis views"',
  'features/workbench/components/plan-panel/PlanNodeDetail.tsx aria-label="Selected plan node"',
  'features/workbench/components/plan-panel/PlanNodeDetail.tsx title="Copy selected node"',
];

function scannedComponents(): [path: string, source: string][] {
  return Object.entries(sources)
    .map(([globPath, source]) => [relativePath(globPath), source] as const)
    .filter(([path]) => !NO_OWN_TEXT.has(path))
    .map(([path, source]) => [path, source] as [string, string]);
}

describe("untranslated UI surfaces", () => {
  // The exact check that would have caught SchemaDesignerDialog,
  // SchemaDiagramDialog, ImportDialog and SearchReplacePanel the moment each
  // was written (#133).
  it("only the known panels bypass i18n entirely", () => {
    const bypassing = scannedComponents()
      .filter(([path]) =>
        /(?:Dialog|Panel|Drawer|Sidebar|Tab)\.tsx$/.test(path),
      )
      .filter(([, source]) => !/\bt\(\s*"/.test(source))
      // A component that renders no text of its own has nothing to translate.
      .filter(([, source]) => /(?:title|aria-label|placeholder)=/.test(source))
      .map(([path]) => path)
      .sort();

    expect(bypassing).toEqual([...PANELS_WITHOUT_I18N].sort());
  });

  it("only the known text attributes are hardcoded", () => {
    const pattern = new RegExp(
      `\\b(${TEXT_ATTRIBUTES.join("|")})="([^"]+)"`,
      "g",
    );
    const found: string[] = [];

    for (const [path, source] of scannedComponents()) {
      for (const match of source.matchAll(pattern)) {
        const [, attribute, value] = match;
        if (NOT_PROSE.test(value)) {
          continue;
        }
        found.push(`${path} ${attribute}="${value}"`);
      }
    }

    // Deduplicated: the same literal appearing twice in a file (a title and a
    // matching aria-label) is one thing to fix, not two.
    expect([...new Set(found)].sort()).toEqual(
      [...new Set(HARDCODED_TEXT_ATTRIBUTES)].sort(),
    );
  });

  // The four dialogs #133 named, pinned by name so a future refactor cannot
  // quietly drop their i18n wiring back out.
  it.each([
    "features/schema-designer/SchemaDesignerDialog.tsx",
    "features/schema-diagram/SchemaDiagramDialog.tsx",
    "features/import/ImportDialog.tsx",
    "features/search/SearchReplacePanel.tsx",
  ])("%s resolves its text through t()", (path) => {
    const source = scannedComponents().find(
      ([candidate]) => candidate === path,
    );

    expect(source, `${path} not found in the scan`).toBeDefined();
    expect(source?.[1]).toMatch(/\bt\(\s*"/);
  });
});
