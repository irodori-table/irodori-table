import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResultExport } from "@/app/controllers/use-result-export";
import { buildXlsxBlob } from "@/features/results/result-xlsx";
import type { QueryResult } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";

const tauri = vi.hoisted(() => ({ save: vi.fn(), writeFile: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: tauri.save }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: tauri.writeFile }));

type TauriWindow = Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };

const xlsxMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// The shape of the PostgreSQL result that failed: uuid, text, integer, jsonb
// and timestamptz columns, with NULLs, as the backend sends them (JSON values).
const pgResult: QueryResult = {
  columns: ["id", "name", "qty", "payload", "created_at"],
  rows: [
    [
      "0f8fad5b-d9cb-469f-a165-70867728950e",
      "alpha",
      1,
      { tags: ["a", "b"], nested: { ok: true } },
      "2026-11-01 09:00:00+00",
    ],
    ["7c9e6679-7425-40de-944b-e07fc1f90ae7", "beta", 2, [1, 2, 3], null],
    ["16fd2706-8baf-433b-82eb-8c7fada847da", null, 3, null, null],
    ["886313e1-3b8a-4372-9b90-0c9aee199e5d", "gamma", null, {}, null],
    ["a3bb189e-8bf9-3888-9912-ace4e6543002", "", 0, [], null],
    ["c56a4180-65aa-42ec-a945-5fd21dec0538", "delta", -7, { n: null }, null],
    [null, null, null, null, null],
  ],
  rowCount: 7n,
  elapsedMs: 1n,
  truncated: false,
};

async function leadingBytes(data: Blob | Uint8Array, count: number) {
  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(await data.arrayBuffer());
  return Array.from(bytes.slice(0, count));
}

// An .xlsx file is a zip archive, which always starts with "PK\x03\x04".
const zipMagic = [0x50, 0x4b, 0x03, 0x04];

// write-excel-file v4 returns `{ toBlob, toFile }` instead of a Blob. The
// builder cast that object to a Blob, so the desktop save path called
// `.arrayBuffer()` on it, swallowed the failure, and fell back to
// `URL.createObjectURL`, which WebKit rejects with a bare "Type error".
describe("native Excel export", () => {
  afterEach(() => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("builds a real xlsx Blob", async () => {
    const blob = await buildXlsxBlob(pgResult, "orders");

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(xlsxMime);
    expect(await leadingBytes(blob, 4)).toEqual(zipMagic);
  });

  it("writes the workbook through the native Save As dialog", async () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = {
      invoke: () => Promise.resolve(),
    };
    tauri.save.mockResolvedValue("/home/user/orders.xlsx");
    tauri.writeFile.mockResolvedValue(undefined);
    const showActionNotice = vi.fn();
    const { t } = createTranslator("en");
    const { result } = renderHook(() =>
      useResultExport({
        activeResult: pgResult,
        activeConnectionId: "pg",
        inferEditTarget: () => ({ table: "orders" }),
        setExportMenuOpen: vi.fn(),
        showActionNotice,
        t,
      }),
    );

    await result.current.exportActiveResult("xlsx");

    expect(showActionNotice).toHaveBeenCalledTimes(1);
    expect(showActionNotice).toHaveBeenCalledWith(
      "success",
      t("notice.grid.exportSaved"),
      "/home/user/orders.xlsx",
    );
    expect(tauri.writeFile).toHaveBeenCalledTimes(1);
    const [path, bytes] = tauri.writeFile.mock.calls[0] as [string, Uint8Array];
    expect(path).toBe("/home/user/orders.xlsx");
    expect(await leadingBytes(bytes, 4)).toEqual(zipMagic);
  });
});
