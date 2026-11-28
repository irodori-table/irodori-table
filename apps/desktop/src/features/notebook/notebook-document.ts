export type CellType = "sql" | "markdown";

type CellSource = { type: CellType; source: string };
export type NotebookCell = CellSource & { id: string };
export type NotebookDocument = {
  id: string;
  name: string;
  cells: NotebookCell[];
  dirty?: boolean;
};

export const notebookExtension = ".irodori-notebook.json";

export function notebookCell(type: CellType, source = ""): NotebookCell {
  return { id: crypto.randomUUID(), type, source };
}

export function notebookDocument(
  name: string,
  cells: NotebookCell[] = [notebookCell("sql")],
): NotebookDocument {
  return { id: crypto.randomUUID(), name, cells };
}

export function serializeNotebook(doc: NotebookDocument): string {
  return (
    JSON.stringify(
      {
        version: 1,
        cells: doc.cells.map(({ type, source }) => ({ type, source })),
      },
      null,
      2,
    ) + "\n"
  );
}

export function parseNotebook(
  text: string,
  name: string,
): NotebookDocument | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 1 ||
    !("cells" in data) ||
    !Array.isArray(data.cells)
  ) {
    return null;
  }
  const cells: NotebookCell[] = [];
  for (const cell of data.cells) {
    if (
      !cell ||
      (cell.type !== "sql" && cell.type !== "markdown") ||
      typeof cell.source !== "string"
    ) {
      return null;
    }
    cells.push(notebookCell(cell.type, cell.source));
  }
  return notebookDocument(name, cells);
}
