import type { SqlEditorSelection } from "./SqlEditor";

export type EditorGroup = "primary" | "secondary";
export type EditorSelection = SqlEditorSelection;
export type EditorSelections = readonly EditorSelection[];
