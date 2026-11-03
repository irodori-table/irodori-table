import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// App commands are resolved by a window-level keydown listener, which sees an
// editor keystroke only after CodeMirror has. CodeMirror's own keymap binds
// some of the same chords: Mod-Enter inserts a blank line, Mod-/ toggles a
// comment. So Ctrl+Enter ran the query *and* added a line, and Ctrl+/
// commented the line and the app's toggle uncommented it again.
//
// The keybinding manager registers here whether it will take a key event; the
// editor then leaves that event alone and the app command is its only effect.

type KeyOwner = (event: KeyboardEvent) => boolean;

const nobody: KeyOwner = () => false;
let owner: KeyOwner = nobody;

/** Register the app's claim on editor key events. Returns the unregister. */
export function setAppKeyOwner(next: KeyOwner): () => void {
  owner = next;
  return () => {
    if (owner === next) {
      owner = nobody;
    }
  };
}

/** Whether the app will handle this key event itself. */
export function appOwnsKey(event: KeyboardEvent): boolean {
  return owner(event);
}

/**
 * Keep CodeMirror's keymaps off keys an app command owns. `unless` lets an
 * editor state take the key back, e.g. a popup with its own binding for it.
 */
export function deferAppKeybindings(
  unless: (view: EditorView) => boolean = () => false,
): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event, view) => !unless(view) && appOwnsKey(event),
    }),
  );
}
