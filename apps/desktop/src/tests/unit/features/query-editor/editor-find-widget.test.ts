import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  getSearchQuery,
  openSearchPanel,
  searchKeymap,
} from "@codemirror/search";
import { usePreferencesStore } from "@/features/preferences";
import { editorFindWidget } from "@/features/query-editor/editor-find-widget";

const doc = "select id from users;\nselect name from users;\n";

let view: EditorView | null = null;

function openWidget(options: { readOnly?: boolean } = {}) {
  const parent = document.createElement("div");
  document.body.append(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        editorFindWidget(),
        keymap.of(searchKeymap),
        EditorState.readOnly.of(options.readOnly ?? false),
      ],
    }),
  });
  openSearchPanel(view);
  const widget = parent.querySelector<HTMLElement>(".cm-find-widget");
  if (!widget) {
    throw new Error("find widget did not open");
  }
  const field = (name: string) =>
    widget.querySelector<HTMLInputElement>(`input[name='${name}']`)!;
  const button = (name: string) =>
    widget.querySelector<HTMLButtonElement>(`button[name='${name}']`)!;
  const type = (name: string, value: string) => {
    field(name).value = value;
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (name: string, init: KeyboardEventInit) =>
    field(name).dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  return {
    view,
    widget,
    field,
    button,
    type,
    key,
    count: () => widget.querySelector(".cm-find-count")?.textContent,
  };
}

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

afterEach(() => {
  view?.dom.parentElement?.remove();
  view?.destroy();
  view = null;
});

describe("editor find widget", () => {
  it("replaces the stock panel with the compact widget", () => {
    const { view, widget, field } = openWidget();

    expect(view.dom.querySelector(".cm-search")).toBeNull();
    expect(widget).toHaveAttribute("role", "search");
    // openSearchPanel looks the field up by this attribute to refocus it.
    expect(field("search")).toHaveAttribute("main-field", "true");
    expect(field("search")).toHaveAttribute("placeholder", "Find");
  });

  it("selects the nearest match while typing and counts matches", () => {
    const { view, type, count } = openWidget();

    expect(count()).toBe("");
    type("search", "users");

    expect(getSearchQuery(view.state).search).toBe("users");
    expect(view.state.selection.main).toMatchObject({ from: 15, to: 20 });
    expect(count()).toBe("1 of 2");

    type("search", "nothing here");
    expect(count()).toBe("No results");
  });

  it("steps through matches with Enter and Shift+Enter", () => {
    const { view, type, key, count } = openWidget();
    type("search", "users");

    key("search", { key: "Enter" });
    expect(count()).toBe("2 of 2");
    expect(view.state.selection.main.from).toBe(39);

    key("search", { key: "Enter", shiftKey: true });
    expect(count()).toBe("1 of 2");
  });

  it("shows ? when the caret leaves the match", () => {
    const { view, type, count } = openWidget();
    type("search", "users");

    view.dispatch({ selection: { anchor: 0 } });

    expect(count()).toBe("? of 2");
  });

  it("toggles match case, whole word and regexp from the inline buttons", () => {
    const { view, type, button, count } = openWidget();
    type("search", "USERS");
    expect(count()).toBe("1 of 2");

    button("caseSensitive").click();

    expect(button("caseSensitive")).toHaveAttribute("aria-pressed", "true");
    expect(getSearchQuery(view.state).caseSensitive).toBe(true);
    expect(count()).toBe("No results");

    button("regexp").click();
    button("wholeWord").click();
    expect(getSearchQuery(view.state)).toMatchObject({
      regexp: true,
      wholeWord: true,
    });
  });

  it("marks an invalid regular expression", () => {
    const { type, button, count, widget } = openWidget();
    button("regexp").click();

    type("search", "(");

    expect(count()).toBe("No results");
    expect(widget.querySelector(".cm-find-field")).toHaveClass("is-invalid");
    expect(button("next")).toBeDisabled();
  });

  it("expands the replace row and replaces through the editor", () => {
    const { view, type, button, field } = openWidget();
    const toggle = button("toggleReplace");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(field("replace").closest(".cm-find-row")).toHaveAttribute("hidden");

    toggle.click();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(field("replace").closest(".cm-find-row")).not.toHaveAttribute(
      "hidden",
    );

    type("search", "users");
    type("replace", "people");
    button("replaceAll").click();

    expect(view.state.doc.toString()).toBe(
      "select id from people;\nselect name from people;\n",
    );
  });

  it("hides replace in a read-only editor", () => {
    const { widget, button } = openWidget({ readOnly: true });

    expect(button("toggleReplace")).toHaveAttribute("hidden");
    expect(widget.querySelector("input[name='replace']")).toBeNull();
  });

  it("closes on Escape through the search keymap", () => {
    const { view, key } = openWidget();

    key("search", { key: "Escape" });

    expect(view.dom.querySelector(".cm-find-widget")).toBeNull();
  });

  it("labels the widget in Japanese", () => {
    usePreferencesStore.setState({ locale: "ja" });
    const { type, count, field, button } = openWidget();

    expect(field("search")).toHaveAttribute("placeholder", "検索");
    expect(button("close")).toHaveAccessibleName("閉じる");
    type("search", "users");
    expect(count()).toBe("1 / 2");
  });
});
