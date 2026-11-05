import { useMemo } from "react";
import type { CommandMeta, Keymap } from "@/core";
import type { InstalledExtension } from "@/generated/irodori-api";
import { useExtensionRuntimeStore } from "../runtime-store";

/**
 * Tools contributed by installed native extensions.
 *
 * A tool is a dialog the host renders from the manifest: its form is described
 * under `contributes.tools`, and its module answers `tool.run` with the output
 * to show. Nothing here is trusted to be well formed, because it comes from a
 * downloaded manifest and module, so everything is decoded field by field and a
 * tool or tab that does not make sense is dropped rather than shown broken.
 */
export type LocalizedText = Record<string, string>;
export type ToolFieldValue = string | number | boolean;
export type ToolValues = Record<string, ToolFieldValue>;

export type ToolFormField = {
  id: string;
  label: LocalizedText;
  type: "string" | "number" | "boolean" | "select" | "lines";
  defaultValue: ToolFieldValue;
  options: { value: string; label: LocalizedText }[];
  min?: number;
  max?: number;
  step?: number;
};

export type ToolFormSection = { columns: number; fields: ToolFormField[] };

export type ExtensionTool = {
  commandId: string;
  extensionId: string;
  id: string;
  title: LocalizedText;
  shortcut?: string;
  sections: ToolFormSection[];
};

export type ToolOutputTab = {
  id: string;
  title: string;
  kind: "overview" | "code" | "text";
  text: string;
  metrics: { label: string; value: string }[];
  steps: { title: string; detail: string; level: string }[];
  notes: { title: string; items: string[]; warning: boolean }[];
};

export type ToolOutput = { title: string; tabs: ToolOutputTab[] };

const COMMAND_PREFIX = "tool.";
const FIELD_TYPES = new Set(["string", "number", "boolean", "select", "lines"]);
const MAX_COLUMNS = 4;

export function isToolCommandId(commandId: string) {
  return commandId.startsWith(COMMAND_PREFIX);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function strings(value: unknown) {
  return list(value).filter((item): item is string => typeof item === "string");
}

function localizedText(value: unknown): LocalizedText | null {
  const source = record(value);
  if (!source || typeof source.en !== "string" || !source.en) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** The text for `locale`, falling back on `en`, which every manifest must have. */
export function localize(value: LocalizedText, locale: string) {
  return value[locale] ?? value.en ?? "";
}

function decodeField(value: unknown): ToolFormField | null {
  const source = record(value);
  const label = localizedText(source?.label);
  const id = text(source?.id);
  const type = text(source?.type);
  if (!source || !label || !id || !FIELD_TYPES.has(type)) {
    return null;
  }
  const options = list(source.options).flatMap((option) => {
    const item = record(option);
    const optionLabel = localizedText(item?.label);
    return item && typeof item.value === "string" && optionLabel
      ? [{ value: item.value, label: optionLabel }]
      : [];
  });
  const fallback = type === "boolean" ? false : type === "number" ? 0 : "";
  const declared = source.default;
  const defaultValue =
    typeof declared === typeof fallback
      ? (declared as ToolFieldValue)
      : type === "select"
        ? (options[0]?.value ?? "")
        : fallback;
  return {
    id,
    label,
    type: type as ToolFormField["type"],
    defaultValue,
    options,
    min: finite(source.min),
    max: finite(source.max),
    step: finite(source.step),
  };
}

function decodeSection(value: unknown): ToolFormSection | null {
  const source = record(value);
  const fields = list(source?.fields).flatMap((field) => {
    const decoded = decodeField(field);
    return decoded ? [decoded] : [];
  });
  if (fields.length === 0) {
    return null;
  }
  const columns = Math.trunc(finite(source?.columns) ?? 1);
  return { columns: Math.min(Math.max(columns, 1), MAX_COLUMNS), fields };
}

function decodeTool(extensionId: string, value: unknown): ExtensionTool | null {
  const source = record(value);
  const id = text(source?.id);
  const title = localizedText(source?.title);
  const sections = list(record(source?.form)?.sections).flatMap((section) => {
    const decoded = decodeSection(section);
    return decoded ? [decoded] : [];
  });
  if (!id || !title || sections.length === 0) {
    return null;
  }
  return {
    commandId: `${COMMAND_PREFIX}${extensionId}/${id}`,
    extensionId,
    id,
    title,
    shortcut: text(source?.shortcut) || undefined,
    sections,
  };
}

export function installedTools(
  extensions: readonly InstalledExtension[],
): ExtensionTool[] {
  return extensions.flatMap((extension) =>
    extension.enabled
      ? list(extension.tools).flatMap((tool) => {
          const decoded = decodeTool(extension.id, tool);
          return decoded ? [decoded] : [];
        })
      : [],
  );
}

export function useInstalledTools() {
  const extensions = useExtensionRuntimeStore(
    (state) => state.installedExtensions,
  );
  return useMemo(() => installedTools(extensions), [extensions]);
}

export function defaultToolValues(tool: ExtensionTool): ToolValues {
  return Object.fromEntries(
    tool.sections.flatMap((section) =>
      section.fields.map((field) => [field.id, field.defaultValue]),
    ),
  );
}

function decodeTab(value: unknown): ToolOutputTab | null {
  const source = record(value);
  const id = text(source?.id);
  const title = text(source?.title);
  const kind = text(source?.kind);
  if (!id || !title || !["overview", "code", "text"].includes(kind)) {
    return null;
  }
  return {
    id,
    title,
    kind: kind as ToolOutputTab["kind"],
    text: text(source?.text),
    metrics: list(source?.metrics).flatMap((metric) => {
      const item = record(metric);
      return item ? [{ label: text(item.label), value: text(item.value) }] : [];
    }),
    steps: list(source?.steps).flatMap((step) => {
      const item = record(step);
      return item
        ? [
            {
              title: text(item.title),
              detail: text(item.detail),
              level: text(item.level),
            },
          ]
        : [];
    }),
    notes: list(source?.notes).flatMap((note) => {
      const item = record(note);
      return item
        ? [
            {
              title: text(item.title),
              items: strings(item.items),
              warning: item.tone === "warning",
            },
          ]
        : [];
    }),
  };
}

export function decodeToolOutput(value: unknown): ToolOutput {
  const source = record(value);
  return {
    title: text(source?.title),
    tabs: list(source?.tabs).flatMap((tab) => {
      const decoded = decodeTab(tab);
      return decoded ? [decoded] : [];
    }),
  };
}

export function toolCommands(
  tools: readonly ExtensionTool[],
  locale: string,
): CommandMeta[] {
  return tools.map((tool) => ({
    id: tool.commandId,
    title: localize(tool.title, locale),
    category: "General",
    scope: "global",
  }));
}

/**
 * The keymap with each tool's shortcut, unless something already uses that key.
 *
 * A downloaded manifest should not be able to take a key from the app or from
 * a binding the user chose, so the existing keymap wins.
 */
export function withToolShortcuts(
  keymap: Keymap,
  tools: readonly ExtensionTool[],
  normalize: (sequence: string) => string,
): Keymap {
  const taken = new Set(Object.values(keymap).map(normalize));
  const merged = { ...keymap };
  for (const tool of tools) {
    if (!tool.shortcut || tool.commandId in merged) {
      continue;
    }
    const sequence = normalize(tool.shortcut);
    if (!taken.has(sequence)) {
      taken.add(sequence);
      merged[tool.commandId] = tool.shortcut;
    }
  }
  return merged;
}
