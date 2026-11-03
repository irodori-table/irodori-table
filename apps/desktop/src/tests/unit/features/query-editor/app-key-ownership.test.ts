import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { afterEach, describe, expect, it } from "vitest";
import { appClaimsEditorKey } from "@/app/controllers/use-keybinding-manager";
import { defaultKeymap } from "@/core";
import {
  deferAppKeybindings,
  setAppKeyOwner,
} from "@/features/query-editor/app-key-ownership";

/**
 * App commands run from a window keydown listener that sees an editor
 * keystroke after CodeMirror. CodeMirror binds some of the same chords, so
 * Ctrl+Enter ran the query and also inserted a blank line, and Ctrl+/ was
 * toggled by both and cancelled out. Keys the app owns are now left to it.
 */

const views: EditorView[] = [];
const unregister: (() => void)[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  unregister.splice(0).forEach((undo) => undo());
});

function ctrl(key: string, extra: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
}

function editor(doc: string, selection: EditorSelection) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection,
      extensions: [deferAppKeybindings(), basicSetup],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

describe("appClaimsEditorKey", () => {
  it("claims the run and comment chords bound to app commands", () => {
    expect(appClaimsEditorKey(ctrl("Enter"), defaultKeymap, [])).toBe(true);
    expect(appClaimsEditorKey(ctrl("/"), defaultKeymap, [])).toBe(true);
  });

  it("leaves editing keys to the editor", () => {
    expect(appClaimsEditorKey(ctrl("z"), defaultKeymap, [])).toBe(false);
    expect(appClaimsEditorKey(ctrl("a"), defaultKeymap, [])).toBe(false);
    expect(
      appClaimsEditorKey(
        new KeyboardEvent("keydown", { key: "Tab" }),
        defaultKeymap,
        [],
      ),
    ).toBe(false);
  });

  it("claims the next key of a pending chord sequence", () => {
    expect(appClaimsEditorKey(ctrl("x"), defaultKeymap, ["Mod+K"])).toBe(true);
  });
});

describe("an app-owned key in the editor", () => {
  it("runs no CodeMirror command, so Ctrl+Enter adds no line", () => {
    unregister.push(
      setAppKeyOwner((event) => appClaimsEditorKey(event, defaultKeymap, [])),
    );
    const doc = "begin;\ndelete from t;";
    const view = editor(doc, EditorSelection.single(0, 6));

    view.contentDOM.dispatchEvent(ctrl("Enter"));
    view.contentDOM.dispatchEvent(ctrl("/"));

    expect(view.state.doc.toString()).toBe(doc);
  });

  it("still reaches CodeMirror when the app does not own it", () => {
    const view = editor("select 1;", EditorSelection.single(0));

    view.contentDOM.dispatchEvent(ctrl("Enter"));

    // Nobody registered, so basicSetup's Mod-Enter inserts its blank line.
    expect(view.state.doc.lines).toBe(2);
  });
});
