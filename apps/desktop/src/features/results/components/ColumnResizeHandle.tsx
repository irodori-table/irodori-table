import { useRef } from "react";
import {
  RESULT_COLUMN_MAX_WIDTH,
  RESULT_COLUMN_MIN_WIDTH,
} from "../result-column-widths";
import type { Translator } from "@/i18n";

export function ColumnResizeHandle({
  column,
  width,
  scale,
  onResize,
  t,
}: {
  column: string;
  width: number;
  scale: number;
  onResize: (width: number | null) => void;
  t: Translator["t"];
}) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(
    null,
  );
  const resize = (next: number) =>
    onResize(
      Math.max(
        RESULT_COLUMN_MIN_WIDTH * scale,
        Math.min(RESULT_COLUMN_MAX_WIDTH * scale, next),
      ),
    );
  return (
    <button
      type="button"
      className="column-resize-handle"
      aria-label={t("results.resizeColumn", { column })}
      title={t("results.resizeColumnHint")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start?.pointerId === event.pointerId)
          resize(start.width + event.clientX - start.x);
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResize(null);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          resize(
            width +
              (event.key === "ArrowLeft" ? -1 : 1) *
                (event.shiftKey ? 40 : 10) *
                scale,
          );
        } else if (event.key === "Enter" || event.key === "Home") {
          event.preventDefault();
          onResize(null);
        }
      }}
    />
  );
}
