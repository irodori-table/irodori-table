import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import {
  collectFindMatches,
  currentFindMatchIndex,
  findCountLabel,
  incrementalFindMatch,
  noFindMatches,
  toggleFindOption,
} from "@/features/query-editor/editor-find-matches";

const doc = [
  "select id from users;", // users at 15-20
  "select name from Users;", // Users at 39-44
  "select * from users_archive;", // users at 60-65 (inside users_archive)
].join("\n");
const state = EditorState.create({ doc });

function query(search: string, options: Partial<SearchQuery> = {}) {
  return new SearchQuery({ search, ...options });
}

describe("collectFindMatches", () => {
  it("collects every match in document order", () => {
    expect(collectFindMatches(state, query("users"))).toEqual({
      ranges: [
        { from: 15, to: 20 },
        { from: 39, to: 44 },
        { from: 60, to: 65 },
      ],
      capped: false,
    });
  });

  it("honours case, whole-word and regexp options", () => {
    const count = (q: SearchQuery) =>
      collectFindMatches(state, q).ranges.length;

    expect(count(query("Users", { caseSensitive: true }))).toBe(1);
    expect(count(query("users", { wholeWord: true }))).toBe(2);
    expect(count(query("from \\w+;", { regexp: true }))).toBe(3);
  });

  it("stops at the limit and reports it was capped", () => {
    const matches = collectFindMatches(state, query("s"), 4);

    expect(matches.ranges).toHaveLength(4);
    expect(matches.capped).toBe(true);
  });

  it("treats an empty or invalid query as no matches", () => {
    expect(collectFindMatches(state, query(""))).toEqual(noFindMatches);
    expect(collectFindMatches(state, query("(", { regexp: true }))).toEqual(
      noFindMatches,
    );
  });
});

describe("currentFindMatchIndex", () => {
  const matches = collectFindMatches(state, query("users"));

  it("returns the 1-based position of the selected match", () => {
    expect(currentFindMatchIndex(matches, { from: 15, to: 20 })).toBe(1);
    expect(currentFindMatchIndex(matches, { from: 60, to: 65 })).toBe(3);
  });

  it("returns null when the selection is not exactly a match", () => {
    expect(currentFindMatchIndex(matches, { from: 0, to: 0 })).toBeNull();
    expect(currentFindMatchIndex(matches, { from: 15, to: 18 })).toBeNull();
  });
});

describe("incrementalFindMatch", () => {
  it("picks the first match at or after the position", () => {
    expect(incrementalFindMatch(state, query("users"), 15)).toEqual({
      from: 15,
      to: 20,
    });
    expect(incrementalFindMatch(state, query("users"), 16)).toEqual({
      from: 39,
      to: 44,
    });
  });

  it("wraps to the top when nothing follows", () => {
    expect(incrementalFindMatch(state, query("users"), 61)).toEqual({
      from: 15,
      to: 20,
    });
  });

  it("finds matches past the counting limit", () => {
    const long = EditorState.create({ doc: `${"x ".repeat(2000)}needle` });

    expect(incrementalFindMatch(long, query("needle"), 0)).toEqual({
      from: 4000,
      to: 4006,
    });
  });

  it("returns null without a usable match", () => {
    expect(incrementalFindMatch(state, query("missing"), 0)).toBeNull();
    expect(incrementalFindMatch(state, query(""), 0)).toBeNull();
    expect(
      incrementalFindMatch(state, query("[", { regexp: true }), 0),
    ).toBeNull();
  });
});

describe("toggleFindOption", () => {
  it("flips only the named option and keeps the texts", () => {
    const base = query("users", { replace: "people", literal: true });
    const toggled = toggleFindOption(base, "wholeWord");

    expect(toggled.wholeWord).toBe(true);
    expect(toggled.caseSensitive).toBe(false);
    expect(toggled.regexp).toBe(false);
    expect(toggled.search).toBe("users");
    expect(toggled.replace).toBe("people");
    expect(toggled.literal).toBe(true);
    expect(toggleFindOption(toggled, "wholeWord").eq(base)).toBe(true);
  });
});

describe("findCountLabel", () => {
  const usersMatches = collectFindMatches(state, query("users"));

  it("shows nothing before anything is typed", () => {
    expect(
      findCountLabel(query(""), noFindMatches, { from: 0, to: 0 }),
    ).toEqual({ kind: "idle" });
  });

  it("reports no results for a miss or an invalid pattern", () => {
    expect(
      findCountLabel(query("missing"), noFindMatches, { from: 0, to: 0 }),
    ).toEqual({ kind: "none" });
    expect(
      findCountLabel(query("(", { regexp: true }), noFindMatches, {
        from: 0,
        to: 0,
      }),
    ).toEqual({ kind: "none" });
  });

  it("counts the selected match, or ? when the caret is between matches", () => {
    expect(
      findCountLabel(query("users"), usersMatches, { from: 39, to: 44 }),
    ).toEqual({ kind: "count", current: "2", total: "3" });
    expect(
      findCountLabel(query("users"), usersMatches, { from: 0, to: 0 }),
    ).toEqual({ kind: "count", current: "?", total: "3" });
  });

  it("marks a capped total", () => {
    const capped = collectFindMatches(state, query("s"), 4);

    expect(findCountLabel(query("s"), capped, { from: 0, to: 0 })).toEqual({
      kind: "count",
      current: "?",
      total: "4+",
    });
  });
});
