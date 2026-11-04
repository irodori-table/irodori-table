// Pure match bookkeeping for the editor find widget (editor-find-widget.ts).
// Kept free of DOM so the count, current-match and toggle rules can be unit
// tested against a bare EditorState.

import type { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";

/**
 * Most matches the widget counts. Counting walks the whole document on every
 * edit while the widget is open, so a huge file with a short query would
 * otherwise stall typing; past this the count reads "1000+".
 */
export const FIND_MATCH_COUNT_LIMIT = 1000;

export type FindMatchRange = { from: number; to: number };

export type FindMatches = {
  /** Matches in document order, at most the limit passed to collect. */
  ranges: readonly FindMatchRange[];
  /** True when the document holds more matches than were collected. */
  capped: boolean;
};

export const noFindMatches: FindMatches = { ranges: [], capped: false };

export type FindOption = "caseSensitive" | "wholeWord" | "regexp";

/** Collect up to `limit` matches of `query` in document order. */
export function collectFindMatches(
  state: EditorState,
  query: SearchQuery,
  limit = FIND_MATCH_COUNT_LIMIT,
): FindMatches {
  if (!query.search || !query.valid) {
    return noFindMatches;
  }
  const ranges: FindMatchRange[] = [];
  const cursor = query.getCursor(state);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (ranges.length >= limit) {
      return { ranges, capped: true };
    }
    ranges.push({ from: next.value.from, to: next.value.to });
  }
  return { ranges, capped: false };
}

/**
 * 1-based position of the match the selection covers exactly, or null when the
 * selection is not on a match (the caret sits between matches, or the match is
 * past the counting limit).
 */
export function currentFindMatchIndex(
  matches: FindMatches,
  selection: FindMatchRange,
): number | null {
  const { ranges } = matches;
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];
    if (range.from < selection.from) {
      low = middle + 1;
    } else if (range.from > selection.from) {
      high = middle - 1;
    } else {
      return range.to === selection.to ? middle + 1 : null;
    }
  }
  return null;
}

/**
 * The match to select while the query is being typed: the first one starting
 * at or after `from`, wrapping to the top. Searching from the selection start
 * (not its end, as findNext does) keeps the current match selected while it
 * still matches, so "se" -> "sel" does not skip ahead. Reads the document
 * directly rather than the counted matches, which stop at the count limit.
 */
export function incrementalFindMatch(
  state: EditorState,
  query: SearchQuery,
  from: number,
): FindMatchRange | null {
  if (!query.search || !query.valid) {
    return null;
  }
  const after = query.getCursor(state, from).next();
  if (!after.done) {
    return { from: after.value.from, to: after.value.to };
  }
  const wrapped = query.getCursor(state, 0, from).next();
  return wrapped.done
    ? null
    : { from: wrapped.value.from, to: wrapped.value.to };
}

/** The same query with one of the widget's toggles flipped. */
export function toggleFindOption(
  query: SearchQuery,
  option: FindOption,
): SearchQuery {
  return new SearchQuery({
    search: query.search,
    replace: query.replace,
    literal: query.literal,
    caseSensitive: query.caseSensitive,
    regexp: query.regexp,
    wholeWord: query.wholeWord,
    [option]: !query[option],
  });
}

export type FindCountLabel =
  | { kind: "idle" }
  | { kind: "none" }
  | { kind: "count"; current: string; total: string };

/** What the count slot shows: nothing, "No results", or "2 of 3". */
export function findCountLabel(
  query: SearchQuery,
  matches: FindMatches,
  selection: FindMatchRange,
): FindCountLabel {
  if (!query.search) {
    return { kind: "idle" };
  }
  if (!query.valid || matches.ranges.length === 0) {
    return { kind: "none" };
  }
  const current = currentFindMatchIndex(matches, selection);
  return {
    kind: "count",
    current: current === null ? "?" : String(current),
    total: matches.capped
      ? `${matches.ranges.length}+`
      : String(matches.ranges.length),
  };
}
