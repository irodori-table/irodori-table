import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as exports from "@/features/erd/erd-export";
import { NotebookWorkbench } from "@/features/notebook/NotebookWorkbench";
import {
  parseNotebook,
  serializeNotebook,
} from "@/features/notebook/notebook-document";
import { queryService } from "@/features/workbench/query-service";
import type { QueryResult } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";
import { componentRenderer } from "@/tests/helpers/render";
import { openSqliteFixture } from "@/tests/helpers/sqlite-fixture";

const firstConnection = {
  id: "local-a",
  name: "Local A",
  password: "private-credential",
};
const secondConnection = {
  id: "local-b",
  name: "Local B",
  sessionId: "session-b",
};
const renderNotebook = componentRenderer(NotebookWorkbench, () => ({
  open: true,
  onClose: vi.fn(),
  connections: [firstConnection, secondConnection],
  connected: true,
  onSelectConnection: vi.fn(),
  onConnect: vi.fn().mockResolvedValue(undefined),
  execution: {
    target: { ...firstConnection, isCurrent: vi.fn(() => true) },
    manualTransaction: false,
    reviewSql: vi.fn().mockResolvedValue(true),
    refreshTransactionStatus: vi.fn().mockResolvedValue(undefined),
  },
  t: createTranslator("en").t,
}));

function result(value: string): QueryResult {
  return {
    columns: ["label"],
    rows: [[value]],
    rowCount: 1n,
    elapsedMs: 1n,
    truncated: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

function region(label: string) {
  return within(screen.getByRole("region", { name: label }));
}

function edit(label: string, value: string) {
  fireEvent.change(region(label).getByRole("textbox"), { target: { value } });
}

async function readBlob(blob: Blob) {
  if (typeof blob.text === "function") return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("SQL notebooks in the workbench", () => {
  it("runs individual SQLite cells, saves only ordered source, reopens empty and reruns on the chosen connection", async () => {
    const db = await openSqliteFixture();
    db.exec(
      "create table facts(id integer, label text); insert into facts values (1, 'private result A'), (2, 'private result B')",
    );
    const saved = vi.spyOn(exports, "downloadBlob").mockResolvedValue({
      kind: "browser",
      fileName: "study.irodori-notebook.json",
    });
    const execute = vi
      .spyOn(queryService, "execute")
      .mockImplementation(async ({ sql }) => {
        const row = db.prepare(sql).get() as { label: string };
        return result(row.label);
      });
    try {
      const { user, props, rerender } = renderNotebook();
      const first = "select label from facts where id = 1";
      const second = "select label from facts where id = 2";
      const note = "# Compare the rows";
      fireEvent.change(screen.getByRole("textbox", { name: "File name" }), {
        target: { value: "study" },
      });
      edit("SQL cell 1", first);
      await user.click(screen.getByRole("button", { name: "Add SQL cell" }));
      edit("SQL cell 2", second);
      await user.click(
        screen.getByRole("button", { name: "Add Markdown cell" }),
      );
      edit("Markdown cell 3", note);
      await user.click(
        region("Markdown cell 3").getByRole("button", { name: "Move cell up" }),
      );
      await user.click(
        region("Markdown cell 2").getByRole("button", {
          name: "Preview Markdown",
        }),
      );
      expect(
        region("Markdown cell 2").getByRole("heading", {
          name: "Compare the rows",
        }),
      ).toBeInTheDocument();
      await user.click(
        region("SQL cell 3").getByRole("button", { name: "Run cell" }),
      );
      expect(
        await region("SQL cell 3").findByText("private result B"),
      ).toBeInTheDocument();
      expect(region("SQL cell 1").queryByRole("table")).toBeNull();
      await user.click(
        region("SQL cell 1").getByRole("button", { name: "Run cell" }),
      );
      expect(
        await region("SQL cell 1").findByText("private result A"),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save" }));
      const [blob, name] = saved.mock.calls[0];
      const text = await readBlob(blob);
      expect(name).toBe("study.irodori-notebook.json");
      expect(JSON.parse(text)).toEqual({
        version: 1,
        cells: [
          { type: "sql", source: first },
          { type: "markdown", source: note },
          { type: "sql", source: second },
        ],
      });
      expect(text).not.toMatch(/private|local-a|Local A/);
      const { File } = await vi.importActual<{ File: typeof globalThis.File }>(
        "node:buffer",
      );
      fireEvent.change(
        screen.getByLabelText("Open notebook", { selector: "input" }),
        {
          target: { files: [new File([text], name)] },
        },
      );
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
      expect(screen.queryByRole("table")).toBeNull();
      expect(region("Markdown cell 2").getByRole("textbox")).toHaveValue(note);
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Connection" }),
        "local-b",
      );
      expect(props.onSelectConnection).toHaveBeenCalledWith("local-b");
      rerender(
        <NotebookWorkbench
          {...props}
          execution={{
            ...props.execution,
            target: { ...secondConnection, isCurrent: () => true },
            manualTransaction: true,
          }}
        />,
      );
      await user.click(
        region("SQL cell 3").getByRole("button", { name: "Run cell" }),
      );
      expect(
        await region("SQL cell 3").findByText("private result B"),
      ).toBeInTheDocument();
      expect(execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sql: second,
          connectionId: "local-b",
          sessionId: "session-b",
          manualTransaction: true,
          queryId: expect.any(String),
        }),
      );
      expect(props.execution.refreshTransactionStatus).toHaveBeenCalledTimes(3);
    } finally {
      db.close();
    }
  });

  it("keeps errors, confirmed cancellation and late completions isolated by run and document", async () => {
    const stale = deferred<QueryResult>();
    const execute = vi
      .spyOn(queryService, "execute")
      .mockReturnValueOnce(stale.promise)
      .mockRejectedValueOnce(new Error("missing relation"))
      .mockResolvedValueOnce(result("new result"));
    const cancel = vi.spyOn(queryService, "cancel").mockResolvedValue(true);
    const { user } = renderNotebook();
    edit("SQL cell 1", "select 'long query'");
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    const originalQueryId = execute.mock.calls[0][0].queryId;
    await user.click(screen.getByRole("button", { name: "New notebook" }));
    edit("SQL cell 1", "select * from missing");
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    expect(await region("SQL cell 1").findByRole("alert")).toHaveTextContent(
      "missing relation",
    );
    await user.click(screen.getByRole("tab", { name: /Notebook 1/ }));
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Cancel" }),
    );
    expect(cancel).toHaveBeenCalledWith(originalQueryId);
    expect(
      await region("SQL cell 1").findByText("Cancelled"),
    ).toBeInTheDocument();
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    expect(
      await region("SQL cell 1").findByText("new result"),
    ).toBeInTheDocument();
    expect(execute.mock.calls[2][0].queryId).not.toBe(originalQueryId);
    await user.click(screen.getByRole("tab", { name: /Notebook 2/ }));
    await act(async () => stale.resolve(result("stale result")));
    expect(region("SQL cell 1").getByRole("alert")).toHaveTextContent(
      "missing relation",
    );
    await user.click(screen.getByRole("tab", { name: /Notebook 1/ }));
    expect(region("SQL cell 1").getByText("new result")).toBeInTheDocument();
    expect(screen.queryByText("stale result")).toBeNull();
  });

  it("returns a background result to the same cell after reordering, hiding and switching documents", async () => {
    const pending = deferred<QueryResult>();
    vi.spyOn(queryService, "execute").mockReturnValue(pending.promise);
    const { user, props, rerender } = renderNotebook();
    edit("SQL cell 1", "select 42");
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    await user.click(screen.getByRole("button", { name: "Add SQL cell" }));
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Move cell down" }),
    );
    await user.click(screen.getByRole("button", { name: "New notebook" }));
    rerender(<NotebookWorkbench {...props} open={false} />);
    await act(async () => pending.resolve(result("42")));
    rerender(<NotebookWorkbench {...props} />);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /Notebook 1/ }));
    expect(region("SQL cell 1").queryByRole("table")).toBeNull();
    expect(region("SQL cell 2").getByText("42")).toBeInTheDocument();
    expect(region("SQL cell 2").getByRole("textbox")).toHaveValue("select 42");
  });

  it("honors review, cancellation during review, connection changes and reconnect", async () => {
    const pending = deferred<boolean>();
    const review = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockReturnValue(pending.promise);
    const current = vi.fn(() => true);
    const execute = vi.spyOn(queryService, "execute");
    const cancel = vi.spyOn(queryService, "cancel");
    const { user, props, rerender } = renderNotebook({
      execution: {
        target: { ...firstConnection, isCurrent: current },
        manualTransaction: false,
        reviewSql: review,
        refreshTransactionStatus: vi.fn(),
      },
    });
    edit("SQL cell 1", "delete from facts");
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    expect(
      await region("SQL cell 1").findByText("Query skipped"),
    ).toBeInTheDocument();
    expect(review).toHaveBeenCalledWith("delete from facts");
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Cancel" }),
    );
    expect(region("SQL cell 1").getByText("Cancelled")).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    await user.click(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    );
    current.mockReturnValue(false);
    await act(async () => pending.resolve(true));
    expect(region("SQL cell 1").getByText("Query skipped")).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    rerender(<NotebookWorkbench {...props} connected={false} />);
    expect(
      region("SQL cell 1").getByRole("button", { name: "Run cell" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(props.onConnect).toHaveBeenCalledOnce();
  });

  it("rejects unsupported documents and strips runtime fields when reopening", () => {
    for (const text of [
      "invalid",
      "null",
      '{"version":2,"cells":[]}',
      '{"version":1,"cells":[{"type":"js","source":""}]}',
    ]) {
      expect(parseNotebook(text, "test")).toBeNull();
    }
    const json =
      '{"version":1,"connection":{"password":"secret"},"cells":[{"type":"sql","source":"select 1","id":"stale","rows":["private"]}]}';
    const doc = parseNotebook(json, "test")!;
    expect(doc.cells[0].id).not.toBe("stale");
    expect(JSON.parse(serializeNotebook(doc))).toEqual({
      version: 1,
      cells: [{ type: "sql", source: "select 1" }],
    });
  });
});
