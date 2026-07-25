import { BookmarkPlus, X } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type TranslationKey } from "@/i18n";
import {
  logMarkColors,
  logMarkCount,
  sortedLogMarkLines,
  type LogMarkColor,
  type LogMarks,
} from "./editor-log-marks";

export type LogMarksBarProps = {
  marks: LogMarks;
  activeColor: LogMarkColor;
  onActiveColorChange: (color: LogMarkColor) => void;
  onMarkCurrentLine: () => void;
  onJumpToLine: (line: number) => void;
  onClearMarks: () => void;
};

const colorLabelKeys = {
  amber: "editor.logMarks.color.amber",
  green: "editor.logMarks.color.green",
  blue: "editor.logMarks.color.blue",
  red: "editor.logMarks.color.red",
} as const satisfies Record<LogMarkColor, TranslationKey>;

/**
 * Marked-line strip for `.log` buffers (issue #177, tier 3).
 *
 * Sits under the filter bar so the two log affordances read as one control
 * area. The list is inline rather than a dock panel: the marks are a short
 * ordered set of line numbers, and putting them next to the buffer keeps the
 * jump one click away instead of behind a panel toggle.
 */
export function LogMarksBar({
  marks,
  activeColor,
  onActiveColorChange,
  onMarkCurrentLine,
  onJumpToLine,
  onClearMarks,
}: LogMarksBarProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const markedLines = sortedLogMarkLines(marks);
  const count = logMarkCount(marks);

  return (
    <div
      className="log-marks-bar"
      role="group"
      aria-label={t("editor.logMarks.label")}
    >
      <div
        className="log-mark-colors"
        role="radiogroup"
        aria-label={t("editor.logMarks.color")}
      >
        {logMarkColors.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={color === activeColor}
            aria-label={t(colorLabelKeys[color])}
            title={t(colorLabelKeys[color])}
            className={`log-mark-color log-mark-color-${color}${
              color === activeColor ? " active" : ""
            }`}
            onClick={() => onActiveColorChange(color)}
          />
        ))}
      </div>

      <button
        className="text-button"
        type="button"
        title={t("editor.logMarks.markCurrentLine")}
        aria-label={t("editor.logMarks.markCurrentLine")}
        onClick={onMarkCurrentLine}
      >
        <BookmarkPlus size={13} />
      </button>

      {count > 0 ? (
        <ul className="log-mark-list" aria-label={t("editor.logMarks.list")}>
          {markedLines.map((line) => (
            <li key={line}>
              <button
                type="button"
                className={`log-mark-chip log-mark-color-${marks[line]}`}
                title={t("editor.logMarks.jumpToLine", { line })}
                aria-label={t("editor.logMarks.jumpToLine", { line })}
                onClick={() => onJumpToLine(line)}
              >
                {line}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="log-mark-empty">{t("editor.logMarks.none")}</span>
      )}

      {/* Status and clear share the right-hand slot, matching the filter bar so
          the two strips line up and nothing shifts as marks come and go. */}
      <span className="log-mark-status" role="status">
        {count > 0 ? t("editor.logMarks.count", { count }) : ""}
      </span>
      {count > 0 ? (
        <button
          className="text-button"
          type="button"
          title={t("editor.logMarks.clear")}
          aria-label={t("editor.logMarks.clear")}
          onClick={onClearMarks}
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}
