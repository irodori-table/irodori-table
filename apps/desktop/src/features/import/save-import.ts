import { isTauri } from "@tauri-apps/api/core";
import { keyMessage, LocalizedError } from "@/core";
import {
  importOutputAppend,
  importOutputFinish,
  importOutputOpen,
} from "@/generated/irodori-api";
import { writeCompleteImport, type ImportPlan } from "./importers";

interface OutputWriter {
  write(text: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

async function openOutput(name: string): Promise<OutputWriter | null> {
  if (isTauri()) {
    const handle = await importOutputOpen(name);
    if (handle === null) return null;
    return {
      write: (sql) => importOutputAppend(handle, sql),
      close: () => importOutputFinish(handle, true),
      abort: () => importOutputFinish(handle, false),
    };
  }
  const browser = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
    }) => Promise<FileSystemFileHandle>;
  };
  if (!browser.showSaveFilePicker)
    throw new LocalizedError(keyMessage("import.error.saveUnavailable"));
  const file = await browser.showSaveFilePicker({ suggestedName: name });
  return file.createWritable();
}

export async function saveImportScript(
  file: File,
  format: "csv" | "tsv",
  plan: ImportPlan,
  expectedRows: number,
  signal: AbortSignal,
  chooseOutput = openOutput,
): Promise<boolean> {
  const writer = await chooseOutput(file.name.replace(/\.[^.]+$/, "") + ".sql");
  if (!writer) return false;
  try {
    await writeCompleteImport(
      file,
      format,
      plan,
      expectedRows,
      (text) => writer.write(text),
      signal,
    );
    signal.throwIfAborted();
    await writer.close();
    return true;
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
}
