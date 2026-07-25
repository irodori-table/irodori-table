import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { isRecord } from "@/core";

/**
 * Line marking for `.log` buffers (issue #177, tier 3).
 *
 * A log file is read by scrolling, and the interesting lines are scattered:
 * the request that failed, the line before it, the retry ten thousand lines
 * later. Filtering (tier 2) narrows by rule; marking is the manual counterpart
 * — the reader says "these are the ones", in colours that mean whatever they
 * decide, and can jump back to them.
 *
 * Marks are per file rather than per session: the whole point is to come back
 * to a log later and still have the trail. They key off the tab's file-style
 * label, which is what routes the buffer language in the first place.
 */

export const logMarkColors = ["amber", "green", "blue", "red"] as const;

export type LogMarkColor = (typeof logMarkColors)[number];

/** Marked lines, keyed by 1-based line number. */
export type LogMarks = Readonly<Record<number, LogMarkColor>>;

export const emptyLogMarks: LogMarks = {};

const markColorSet = new Set<string>(logMarkColors);

function isLogMarkColor(value: unknown): value is LogMarkColor {
  return typeof value === "string" && markColorSet.has(value);
}

export function logMarkCount(marks: LogMarks): number {
  return Object.keys(marks).length;
}

/** Marked line numbers in file order, so the list reads top to bottom. */
export function sortedLogMarkLines(marks: LogMarks): number[] {
  return Object.keys(marks)
    .map((line) => Number(line))
    .filter((line) => Number.isInteger(line) && line > 0)
    .sort((a, b) => a - b);
}

export function logMarksEqual(a: LogMarks, b: LogMarks): boolean {
  const aLines = sortedLogMarkLines(a);
  const bLines = sortedLogMarkLines(b);
  if (aLines.length !== bLines.length) {
    return false;
  }
  return aLines.every((line, index) => {
    const other = bLines[index];
    return line === other && a[line] === b[other];
  });
}

/**
 * Toggle a line's mark.
 *
 * Marking an unmarked line adds it in `color`; marking it again in the same
 * colour clears it, and in a different colour recolours it. That keeps one
 * gesture for all three intents.
 */
export function toggleLogMark(
  marks: LogMarks,
  line: number,
  color: LogMarkColor,
): LogMarks {
  if (!Number.isInteger(line) || line < 1) {
    return marks;
  }
  const next: Record<number, LogMarkColor> = { ...marks };
  if (next[line] === color) {
    delete next[line];
  } else {
    next[line] = color;
  }
  return next;
}

/**
 * Drop marks past the end of the document.
 *
 * A log that is re-read after truncation or rotation can be shorter than it
 * was, and a mark pointing past the last line would render nowhere while still
 * showing up in the list.
 */
export function pruneLogMarks(marks: LogMarks, lineCount: number): LogMarks {
  const kept: Record<number, LogMarkColor> = {};
  for (const line of sortedLogMarkLines(marks)) {
    if (line <= lineCount) {
      kept[line] = marks[line];
    }
  }
  return kept;
}

const storagePrefix = "irodori.logMarks.";
const storageVersion = ".v1";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}

/** Storage key for a buffer, identified by its file-style tab label. */
export function logMarksStorageKey(fileKey: string): string {
  return `${storagePrefix}${fileKey}${storageVersion}`;
}

export function loadLogMarks(fileKey: string): LogMarks {
  const store = storage();
  if (!store || !fileKey) {
    return emptyLogMarks;
  }
  try {
    const raw = store.getItem(logMarksStorageKey(fileKey));
    if (!raw) {
      return emptyLogMarks;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return emptyLogMarks;
    }
    const marks: Record<number, LogMarkColor> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const line = Number(key);
      if (Number.isInteger(line) && line > 0 && isLogMarkColor(value)) {
        marks[line] = value;
      }
    }
    return marks;
  } catch {
    return emptyLogMarks;
  }
}

export function saveLogMarks(fileKey: string, marks: LogMarks): void {
  const store = storage();
  if (!store || !fileKey) {
    return;
  }
  try {
    if (logMarkCount(marks) === 0) {
      store.removeItem(logMarksStorageKey(fileKey));
      return;
    }
    store.setItem(logMarksStorageKey(fileKey), JSON.stringify(marks));
  } catch {
    // Storage can be full or blocked; marks are a convenience, not data the
    // user typed, so losing them is preferable to breaking the editor.
  }
}

/** Replace the marks for the current buffer; dispatched by the marks bar. */
export const setLogMarksEffect = StateEffect.define<LogMarks>();

const logMarksField = StateField.define<LogMarks>({
  create: () => emptyLogMarks,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLogMarksEffect) && !logMarksEqual(value, effect.value)) {
        value = effect.value;
      }
    }
    return value;
  },
});

/** The active marks, or none when the field is not installed. */
export function currentLogMarks(state: EditorState): LogMarks {
  return state.field(logMarksField, false) ?? emptyLogMarks;
}

const markDecorations: Record<LogMarkColor, Decoration> = {
  amber: Decoration.line({ class: "cm-log-mark cm-log-mark-amber" }),
  green: Decoration.line({ class: "cm-log-mark cm-log-mark-green" }),
  blue: Decoration.line({ class: "cm-log-mark cm-log-mark-blue" }),
  red: Decoration.line({ class: "cm-log-mark cm-log-mark-red" }),
};

export function buildLogMarkDecorations(state: EditorState): DecorationSet {
  const marks = currentLogMarks(state);
  const lines = sortedLogMarkLines(marks);
  if (lines.length === 0) {
    return Decoration.none;
  }
  const doc = state.doc;
  // Line decorations must be added in document order, which sortedLogMarkLines
  // already guarantees.
  return Decoration.set(
    lines
      .filter((line) => line <= doc.lines)
      .map((line) => markDecorations[marks[line]].range(doc.line(line).from)),
  );
}

/**
 * Line-level mark highlighting. These are line decorations rather than block
 * replacements, so a marked line that the tier-2 filter hides stays hidden —
 * marking and filtering compose instead of fighting.
 */
export const logLineMarks = [
  logMarksField,
  EditorView.decorations.compute(
    ["doc", logMarksField],
    buildLogMarkDecorations,
  ),
];
