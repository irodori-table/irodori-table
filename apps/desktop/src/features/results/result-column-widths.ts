import { formatResultGridCell } from "./result-view-model";

export const RESULT_COLUMN_MIN_WIDTH = 80;
export const RESULT_COLUMN_MAX_WIDTH = 4096;
const AUTO_WIDTH_LIMIT = 720;
const SAMPLE_ROWS = 200;

/** Bound measurement work for large/spilled results and unusually large cells. */
export function measureResultColumnWidths(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  measureText: (text: string, header: boolean) => number,
  scale = 1,
) {
  const widths = columns.map((column) =>
    Math.max(
      RESULT_COLUMN_MIN_WIDTH * scale,
      measureText(column, true) + 44 * scale,
    ),
  );
  for (
    let rowIndex = 0;
    rowIndex < Math.min(rows.length, SAMPLE_ROWS);
    rowIndex++
  ) {
    const row = rows[rowIndex];
    for (let col = 0; col < columns.length; col++) {
      if (widths[col]! >= AUTO_WIDTH_LIMIT * scale) continue;
      const text = formatResultGridCell(
        row && col < row.length ? row[col] : "",
      ).slice(0, 2048);
      widths[col] = Math.max(
        widths[col]!,
        measureText(text || "EMPTY", false) + 24 * scale,
      );
    }
  }
  return widths.map((width) =>
    Math.ceil(Math.min(AUTO_WIDTH_LIMIT * scale, width)),
  );
}

export function resultColumnOffsets(widths: readonly number[]) {
  const offsets = [0];
  for (const width of widths)
    offsets.push(offsets[offsets.length - 1]! + width);
  return offsets;
}

/** Binary search keeps horizontal scrolling independent of the column count. */
export function resultColumnWindow(
  offsets: readonly number[],
  scrollLeft: number,
  viewportWidth: number,
  overscan: number,
) {
  const count = Math.max(0, offsets.length - 1);
  const left = Math.max(0, scrollLeft);
  const right = left + Math.max(0, viewportWidth);
  const search = (position: number, inclusive: boolean) => {
    let low = 0;
    let high = offsets.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (offsets[mid]! < position || (inclusive && offsets[mid] === position))
        low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const firstColumnIndex = Math.max(
    0,
    Math.min(count, search(left, true) - 1) - overscan,
  );
  const lastColumnIndex = Math.min(count, search(right, false) + overscan);
  return {
    firstColumnIndex,
    lastColumnIndex,
    leftPadPx: offsets[firstColumnIndex] ?? 0,
    rightPadPx: (offsets[count] ?? 0) - (offsets[lastColumnIndex] ?? 0),
  };
}
