import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/features/preferences";
import { ExtensionToolDialog } from "@/features/extensions/tools/ExtensionToolDialog";
import type { ExtensionTool } from "@/features/extensions/tools/extension-tools";
import { extToolRun } from "@/generated/irodori-api";

vi.mock("@/generated/irodori-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/generated/irodori-api")>()),
  extToolRun: vi.fn(),
}));

const mockRun = vi.mocked(extToolRun);

const tool: ExtensionTool = {
  commandId: "tool.irodori.demo/demo",
  extensionId: "irodori.demo",
  id: "demo",
  title: { en: "Demo", ja: "デモ" },
  sections: [
    {
      columns: 2,
      fields: [
        {
          id: "table",
          label: { en: "Table", ja: "テーブル" },
          type: "string",
          defaultValue: "orders",
          options: [],
        },
        {
          id: "limit",
          label: { en: "Limit" },
          type: "number",
          defaultValue: 5,
          options: [],
          min: 1,
          step: 10,
        },
        {
          id: "flag",
          label: { en: "Flag" },
          type: "boolean",
          defaultValue: false,
          options: [],
        },
      ],
    },
  ],
};

const output = {
  title: "Plan for orders",
  tabs: [
    {
      id: "overview",
      title: "Overview",
      kind: "overview",
      text: "# Plan",
      metrics: [{ label: "Keys", value: "2" }],
      steps: [{ title: "Extract", detail: "Export it", level: "ready" }],
      notes: [{ title: "Warnings", items: ["Careful"], tone: "warning" }],
    },
    { id: "sql", title: "Source SQL", kind: "code", text: "select 1" },
    { id: "runbook", title: "Runbook", kind: "text", text: "Step one" },
  ],
};

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}

function renderDialog() {
  const callbacks = {
    onClose: vi.fn(),
    onCopyText: vi.fn(),
    onPutTextInEditor: vi.fn(),
  };
  render(<ExtensionToolDialog tool={tool} {...callbacks} />);
  return callbacks;
}

describe("ExtensionToolDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRun.mockReset();
    mockRun.mockResolvedValue(output);
    usePreferencesStore.setState({ locale: "en" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the tool with the form's defaults and shows the output", async () => {
    renderDialog();
    await settle();

    expect(mockRun).toHaveBeenCalledWith(
      "irodori.demo",
      "demo",
      { table: "orders", limit: 5, flag: false },
      "en",
    );
    expect(screen.getByText("Plan for orders")).toBeVisible();
    expect(screen.getByText("Keys")).toBeVisible();
    expect(screen.getByText("Extract")).toBeVisible();
    expect(screen.getByText("Careful")).toBeVisible();
  });

  it("builds the form from the manifest, in the locale", async () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderDialog();
    await settle();

    expect(screen.getByRole("dialog", { name: "デモ" })).toBeVisible();
    expect(screen.getByLabelText("テーブル")).toHaveValue("orders");
    const limit = screen.getByLabelText("Limit");
    expect(limit).toHaveAttribute("min", "1");
    expect(limit).toHaveAttribute("step", "10");
    expect(mockRun.mock.calls[0]?.[3]).toBe("ja");
  });

  it("waits for a pause in typing before running again", async () => {
    renderDialog();
    await settle();
    mockRun.mockClear();

    const table = screen.getByLabelText("Table");
    fireEvent.change(table, { target: { value: "o" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    fireEvent.change(table, { target: { value: "ord" } });
    await settle();

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0]?.[2]).toMatchObject({ table: "ord" });
  });

  it("sends a number as a number and an emptied box as empty", async () => {
    renderDialog();
    await settle();

    const limit = screen.getByLabelText("Limit");
    fireEvent.change(limit, { target: { value: "42" } });
    await settle();
    expect(mockRun.mock.lastCall?.[2]).toMatchObject({ limit: 42 });

    fireEvent.change(limit, { target: { value: "" } });
    await settle();
    expect(mockRun.mock.lastCall?.[2]).toMatchObject({ limit: "" });
    expect(limit).toHaveValue(null);
  });

  it("ignores an answer that a newer change has replaced", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    mockRun.mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirst = resolve;
      }),
    );
    renderDialog();
    await settle();

    fireEvent.change(screen.getByLabelText("Table"), {
      target: { value: "new" },
    });
    await settle();
    await act(async () => {
      answerFirst({ title: "Stale", tabs: [] });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Plan for orders")).toBeVisible();
  });

  it("copies and sends the tab that is showing, labelled for its kind", async () => {
    const { onCopyText, onPutTextInEditor } = renderDialog();
    await settle();

    expect(
      screen.getByRole("button", { name: "Put text in editor" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Source SQL" }));
    expect(screen.getByText("select 1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(onCopyText).toHaveBeenCalledWith("select 1", "Source SQL");

    fireEvent.click(screen.getByRole("button", { name: "Put SQL in editor" }));
    expect(onPutTextInEditor).toHaveBeenCalledWith("select 1");
  });

  it("says what went wrong and keeps the last good output", async () => {
    renderDialog();
    await settle();

    mockRun.mockRejectedValueOnce(new Error("no key columns"));
    fireEvent.change(screen.getByLabelText("Table"), {
      target: { value: "" },
    });
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("no key columns");
    expect(screen.getByText("Extract")).toBeVisible();
  });

  it("cannot copy or send anything before there is output", async () => {
    mockRun.mockRejectedValueOnce("the extension stopped");
    renderDialog();
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "the extension stopped",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });
});
