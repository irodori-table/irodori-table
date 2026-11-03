// VS Code-style find/replace widget for the SQL editor.
//
// CodeMirror's stock search panel is a full-width bar of native inputs,
// checkboxes and text buttons that pushes the document down. This replaces
// only its DOM (through `search({ createPanel })`): queries, highlighting,
// navigation and replacement all still run through @codemirror/search, and the
// widget floats over the top-right of the editor instead.

import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorSelection, type Extension } from "@codemirror/state";
import {
  runScopeHandlers,
  type EditorView,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";
import { currentAppLocale } from "@/features/preferences";
import { createTranslator, type Translator } from "@/i18n";
import {
  collectFindMatches,
  findCountLabel,
  incrementalFindMatch,
  toggleFindOption,
  type FindMatches,
  type FindOption,
} from "./editor-find-matches";
import "./editor-find-widget.css";

type IconNode = ReadonlyArray<
  readonly [tag: "path" | "rect", attributes: Record<string, string>]
>;

// Path data from Lucide (ISC), the icon set the rest of the app uses through
// lucide-react. Panels are plain DOM built outside React, so the six glyphs
// are drawn here instead of mounting a React root per editor.
const icons = {
  chevron: [["path", { d: "m9 18 6-6-6-6" }]],
  arrowUp: [
    ["path", { d: "m5 12 7-7 7 7" }],
    ["path", { d: "M12 19V5" }],
  ],
  arrowDown: [
    ["path", { d: "M12 5v14" }],
    ["path", { d: "m19 12-7 7-7-7" }],
  ],
  close: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  replace: [
    ["path", { d: "M14 4a1 1 0 0 1 1-1" }],
    ["path", { d: "M15 10a1 1 0 0 1-1-1" }],
    ["path", { d: "M21 4a1 1 0 0 0-1-1" }],
    ["path", { d: "M21 9a1 1 0 0 1-1 1" }],
    ["path", { d: "m3 7 3 3 3-3" }],
    ["path", { d: "M6 10V5a2 2 0 0 1 2-2h2" }],
    ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1" }],
  ],
  replaceAll: [
    ["path", { d: "M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1" }],
    ["path", { d: "M14 4a1 1 0 0 1 1-1" }],
    ["path", { d: "M15 10a1 1 0 0 1-1-1" }],
    ["path", { d: "M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1" }],
    ["path", { d: "M21 4a1 1 0 0 0-1-1" }],
    ["path", { d: "M21 9a1 1 0 0 1-1 1" }],
    ["path", { d: "m3 7 3 3 3-3" }],
    ["path", { d: "M6 10V5a2 2 0 0 1 2-2h2" }],
    ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1" }],
  ],
} satisfies Record<string, IconNode>;

const SVG_NS = "http://www.w3.org/2000/svg";

function icon(nodes: IconNode, size = 14): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    width: String(size),
    height: String(size),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    svg.setAttribute(name, value);
  }
  for (const [tag, attributes] of nodes) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      child.setAttribute(name, value);
    }
    svg.append(child);
  }
  return svg;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  return node;
}

function iconButton(
  name: string,
  label: string,
  glyph: SVGSVGElement,
  onClick: () => void,
): HTMLButtonElement {
  const button = element("button", "cm-find-button", {
    type: "button",
    name,
    title: label,
    "aria-label": label,
  });
  button.append(glyph);
  // Keep focus in the field, as VS Code does, so Enter keeps stepping
  // through matches after a click on an arrow.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", onClick);
  return button;
}

// The replace row's open/closed state outlives a close/reopen of the widget,
// like VS Code's, without leaking views that have been destroyed.
const replaceExpandedByView = new WeakMap<EditorView, boolean>();

class FindWidget implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private query: SearchQuery;
  private matches: FindMatches;
  private matchesQuery: SearchQuery;
  private readonly t: Translator["t"];
  private readonly searchField: HTMLInputElement;
  private readonly searchBox: HTMLElement;
  private readonly replaceField: HTMLInputElement;
  private readonly replaceRow: HTMLElement;
  private readonly toggleReplaceButton: HTMLButtonElement;
  private readonly optionButtons: Record<FindOption, HTMLButtonElement>;
  private readonly countLabel: HTMLElement;
  private readonly navigationButtons: HTMLButtonElement[];
  private readonly replaceButtons: HTMLButtonElement[];

  constructor(private readonly view: EditorView) {
    this.t = createTranslator(currentAppLocale()).t;
    const t = this.t;
    this.query = getSearchQuery(view.state);
    this.matchesQuery = this.query;
    this.matches = collectFindMatches(view.state, this.query);
    const readOnly = view.state.readOnly;

    this.dom = element("div", "cm-find-widget", {
      role: "search",
      "aria-label": t("editor.find.label"),
    });
    this.dom.addEventListener("keydown", (event) => this.keydown(event));

    this.toggleReplaceButton = iconButton(
      "toggleReplace",
      t("editor.find.toggleReplace"),
      icon(icons.chevron),
      () => this.setReplaceExpanded(!this.replaceExpanded),
    );
    this.toggleReplaceButton.classList.add("cm-find-toggle-replace");
    this.toggleReplaceButton.hidden = readOnly;

    // `main-field` is how openSearchPanel finds the input to refocus and
    // select when Ctrl/Cmd+F is pressed with the widget already open.
    // Not `cm-textfield`: CodeMirror's base theme gives that class a silver
    // border and a 70% font size that would fight the field styling.
    this.searchField = element("input", "cm-find-input", {
      name: "search",
      "main-field": "true",
      placeholder: t("editor.find.placeholder"),
      "aria-label": t("editor.find.placeholder"),
      autocomplete: "off",
      spellcheck: "false",
    });
    this.searchField.value = this.query.search;
    this.searchField.addEventListener("input", () => this.commit(true));

    const option = (name: FindOption, text: string, label: string) => {
      const button = element(
        "button",
        `cm-find-option cm-find-option-${name}`,
        {
          type: "button",
          name,
          title: label,
          "aria-label": label,
          "aria-pressed": String(this.query[name]),
        },
      );
      button.textContent = text;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        this.query = toggleFindOption(this.query, name);
        this.syncOptionButtons();
        this.commit(true);
      });
      return button;
    };
    this.optionButtons = {
      caseSensitive: option("caseSensitive", "Aa", t("search.matchCase")),
      wholeWord: option("wholeWord", "ab", t("search.matchWholeWord")),
      regexp: option("regexp", ".*", t("search.useRegex")),
    };

    this.searchBox = element("div", "cm-find-field");
    this.searchBox.append(
      this.searchField,
      this.optionButtons.caseSensitive,
      this.optionButtons.wholeWord,
      this.optionButtons.regexp,
    );

    this.countLabel = element("span", "cm-find-count");

    const previous = iconButton(
      "prev",
      t("editor.find.previous"),
      icon(icons.arrowUp),
      () => findPrevious(view),
    );
    const next = iconButton(
      "next",
      t("editor.find.next"),
      icon(icons.arrowDown),
      () => findNext(view),
    );
    this.navigationButtons = [previous, next];
    const close = iconButton(
      "close",
      t("editor.find.close"),
      icon(icons.close),
      () => closeSearchPanel(view),
    );

    const findRow = element("div", "cm-find-row");
    findRow.append(this.searchBox, this.countLabel, previous, next, close);

    this.replaceField = element("input", "cm-find-input", {
      name: "replace",
      placeholder: t("editor.find.replacePlaceholder"),
      "aria-label": t("editor.find.replacePlaceholder"),
      autocomplete: "off",
      spellcheck: "false",
    });
    this.replaceField.value = this.query.replace;
    this.replaceField.addEventListener("input", () => this.commit(false));
    const replaceBox = element("div", "cm-find-field");
    replaceBox.append(this.replaceField);
    this.replaceButtons = [
      iconButton("replace", t("editor.find.replace"), icon(icons.replace), () =>
        replaceNext(view),
      ),
      iconButton(
        "replaceAll",
        t("editor.find.replaceAll"),
        icon(icons.replaceAll),
        () => replaceAll(view),
      ),
    ];
    const replaceActions = element("div", "cm-find-replace-actions");
    replaceActions.append(...this.replaceButtons);
    this.replaceRow = element("div", "cm-find-row cm-find-replace-row");
    this.replaceRow.append(replaceBox, replaceActions);

    const rows = element("div", "cm-find-rows");
    rows.append(findRow);
    if (!readOnly) {
      rows.append(this.replaceRow);
    }
    this.dom.append(this.toggleReplaceButton, rows);

    this.setReplaceExpanded(
      !readOnly && (replaceExpandedByView.get(view) ?? false),
    );
    this.render();
  }

  mount() {
    this.searchField.select();
  }

  update(update: ViewUpdate) {
    const query = getSearchQuery(update.state);
    if (!query.eq(this.query)) {
      // Changed from outside the widget (Ctrl/Cmd+F with a selection, say).
      this.setQuery(query);
    }
    if (update.docChanged || !query.eq(this.matchesQuery)) {
      this.matches = collectFindMatches(update.state, query);
      this.matchesQuery = query;
    }
    // Cheap: the current-match lookup is a binary search over the counted
    // matches, so the selection can move without a rescan.
    this.render();
  }

  private get replaceExpanded() {
    return this.dom.classList.contains("is-replace-expanded");
  }

  private setReplaceExpanded(expanded: boolean) {
    this.dom.classList.toggle("is-replace-expanded", expanded);
    this.replaceRow.hidden = !expanded;
    this.toggleReplaceButton.setAttribute("aria-expanded", String(expanded));
    replaceExpandedByView.set(this.view, expanded);
  }

  private setQuery(query: SearchQuery) {
    this.query = query;
    this.searchField.value = query.search;
    this.replaceField.value = query.replace;
    this.syncOptionButtons();
  }

  private syncOptionButtons() {
    for (const [name, button] of Object.entries(this.optionButtons)) {
      button.setAttribute(
        "aria-pressed",
        String(this.query[name as FindOption]),
      );
    }
  }

  /**
   * Push the fields into the editor's search state. A change to what is being
   * searched for also selects the nearest match, so the editor follows the
   * typing the way VS Code's find does; a replace-text edit does not move.
   */
  private commit(followMatch: boolean) {
    const query = new SearchQuery({
      search: this.searchField.value,
      replace: this.replaceField.value,
      literal: this.query.literal,
      caseSensitive: this.query.caseSensitive,
      regexp: this.query.regexp,
      wholeWord: this.query.wholeWord,
    });
    if (query.eq(this.matchesQuery)) {
      return;
    }
    const state = this.view.state;
    this.query = query;
    this.matches = collectFindMatches(state, query);
    this.matchesQuery = query;
    const match = followMatch
      ? incrementalFindMatch(state, query, state.selection.main.from)
      : null;
    this.view.dispatch({
      effects: setSearchQuery.of(query),
      ...(match
        ? {
            selection: EditorSelection.single(match.from, match.to),
            scrollIntoView: true,
            userEvent: "select.search",
          }
        : {}),
    });
    this.render();
  }

  private keydown(event: KeyboardEvent) {
    // Escape, Ctrl/Cmd+F, F3 and Ctrl/Cmd+G come from searchKeymap's
    // "search-panel" scope, exactly as in the stock panel.
    if (runScopeHandlers(this.view, event, "search-panel")) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter" || event.isComposing) {
      return;
    }
    // Modified Enter is left alone: the app keymap binds Mod+Enter and friends
    // to the run commands, and its window listener sees this event as well.
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.target === this.searchField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(this.view);
    } else if (event.target === this.replaceField) {
      event.preventDefault();
      replaceNext(this.view);
    }
  }

  private render() {
    const label = findCountLabel(
      this.query,
      this.matches,
      this.view.state.selection.main,
    );
    this.countLabel.textContent =
      label.kind === "count"
        ? this.t("editor.find.matchCount", {
            current: label.current,
            total: label.total,
          })
        : label.kind === "none"
          ? this.t("editor.find.noResults")
          : "";
    this.countLabel.classList.toggle("is-empty", label.kind === "none");
    this.searchBox.classList.toggle(
      "is-invalid",
      Boolean(this.query.search) && !this.query.valid,
    );
    const noMatches = this.matches.ranges.length === 0;
    for (const button of this.navigationButtons) {
      button.disabled = noMatches;
    }
    for (const button of this.replaceButtons) {
      button.disabled = noMatches || this.view.state.readOnly;
    }
  }
}

/** CodeMirror's search state with the find widget as its panel. */
export function editorFindWidget(): Extension {
  return search({ top: true, createPanel: (view) => new FindWidget(view) });
}
