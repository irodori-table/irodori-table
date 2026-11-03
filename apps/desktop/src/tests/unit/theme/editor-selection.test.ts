import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { editorThemeExtensions, lightTheme } from "@/theme";

/**
 * The theme's active-line colour is opaque and CodeMirror paints it above the
 * selection, so it hid the selection on the line holding the cursor. While a
 * selection exists the editor is marked and the theme leaves the active line
 * unpainted.
 */

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
});

function editor(selection: EditorSelection) {
  const view = new EditorView({
    state: EditorState.create({
      doc: "select\n  *\nfrom users;",
      selection,
      extensions: [highlightActiveLine(), editorThemeExtensions(lightTheme)],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

describe("active line under a selection", () => {
  it("marks the editor while text is selected", () => {
    const view = editor(EditorSelection.single(20, 1));

    expect(view.dom.classList.contains("cm-has-selection")).toBe(true);
  });

  it("leaves a bare cursor unmarked so the active line still shows", () => {
    const view = editor(EditorSelection.single(1));

    expect(view.dom.classList.contains("cm-has-selection")).toBe(false);
  });

  it("drops the mark once the selection collapses", () => {
    const view = editor(EditorSelection.single(20, 1));

    view.dispatch({ selection: EditorSelection.cursor(1) });

    expect(view.dom.classList.contains("cm-has-selection")).toBe(false);
  });
});
