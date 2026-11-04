import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useResultGridEditing,
  type ResultGridEditingDeps,
} from "@/app/controllers/use-result-grid-editing";
import type {
  DatabaseMetadata,
  QueryResult,
  QueryResultSet,
} from "@/generated/irodori-api";
import type { ConfirmOptions } from "@/components/ConfirmDialog";
import { queryService } from "@/features/workbench";
import { createTranslator } from "@/i18n";

/**
 * Rows are written back only from a table's own tab, opened from the sidebar.
 * There a double-click on a cell starts editing it. Results of SQL the user
 * wrote stay read-only, and every save asks first with what will change.
 */

const { t } = createTranslator("en");

const memories: DatabaseMetadata = {
  schemas: [
    {
      name: "public",
      objects: [
        {
          schema: "public",
          name: "memories",
          kind: "table",
          columns: [
            { name: "id", dataType: "uuid", nullable: false, ordinal: 1 },
            { name: "kind", dataType: "text", nullable: false, ordinal: 2 },
          ],
          indexes: [],
          primaryKey: ["id"],
          foreignKeys: [],
        },
      ],
    },
  ],
};

const memoriesTable = memories.schemas[0].objects[0];

const resultSet = {
  columns: ["id", "kind"],
  rows: [["a", "fact"]],
} as unknown as QueryResultSet;

function editing(overrides: Partial<ResultGridEditingDeps>) {
  const deps = {
    result: { sets: [resultSet] } as unknown as QueryResult,
    activeResult: resultSet,
    resultColumns: ["id", "kind"],
    activeConnectionId: "local",
    activeConnectionReadOnly: false,
    activeEngine: "postgres",
    lastRunSql: 'select * from "public"."memories" limit 200;',
    metadataByConnection: { local: memories },
    tableViewObject: memoriesTable,
    editMode: false,
    editingCell: null,
    t,
    ...overrides,
  } as Partial<ResultGridEditingDeps>;
  // Every collaborator the double-click path does not read is a spy.
  const spies = new Map<string, ReturnType<typeof vi.fn>>();
  const proxy = new Proxy(deps, {
    get(target, key: string) {
      if (key in target) {
        return target[key as keyof typeof target];
      }
      if (!spies.has(key)) {
        spies.set(key, vi.fn());
      }
      return spies.get(key);
    },
  }) as ResultGridEditingDeps;
  return {
    actions: useResultGridEditing(proxy),
    spy: (key: string) => proxy[key as keyof ResultGridEditingDeps],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("double-clicking a result cell", () => {
  it("enters edit mode and edits that cell", () => {
    const { actions, spy } = editing({});

    actions.beginCellEdit("o0", 1);

    expect(spy("setEditMode")).toHaveBeenCalledWith(true);
    expect(spy("selectGridCell")).toHaveBeenCalledWith("o0", 1);
    expect(spy("setEditingCell")).toHaveBeenCalledWith({ key: "o0", col: 1 });
  });

  it("leaves the result of hand-written SQL read-only", () => {
    // The same single-table SELECT, but typed in a query tab: no table tab.
    const { actions, spy } = editing({ tableViewObject: null });

    actions.beginCellEdit("o0", 1);

    expect(actions.canEditActiveResult()).toBe(false);
    expect(spy("setEditMode")).not.toHaveBeenCalled();
    expect(spy("setEditingCell")).not.toHaveBeenCalled();
  });

  it("does not edit a table tab whose SQL now reads another table", () => {
    const { actions } = editing({
      lastRunSql: 'select * from "public"."users" limit 200;',
    });

    expect(actions.canEditActiveResult()).toBe(false);
  });

  it("does not edit on a read-only connection", () => {
    const { actions, spy } = editing({ activeConnectionReadOnly: true });

    actions.beginCellEdit("o0", 1);

    expect(spy("setEditMode")).not.toHaveBeenCalled();
    expect(spy("setEditingCell")).not.toHaveBeenCalled();
  });
});

describe("saving edits", () => {
  it("asks before writing an update, and writes nothing when cancelled", async () => {
    const apply = vi.spyOn(queryService, "applyEdits");
    const confirm = vi.fn(async (_options: ConfirmOptions) => false);
    const { actions } = editing({
      editMode: true,
      cellEdits: new Map([["o0:1", "opinion"]]),
      newRows: [],
      deletedRows: new Set(),
      confirm,
    });

    await actions.commitEdits();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatchObject({
      title: "Apply 1 changes to public.memories?",
      tone: "default",
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("warns that deletes cannot be restored", async () => {
    const confirm = vi.fn(async (_options: ConfirmOptions) => false);
    const { actions } = editing({
      editMode: true,
      cellEdits: new Map(),
      newRows: [],
      deletedRows: new Set([0]),
      confirm,
    });

    await actions.commitEdits();

    expect(confirm.mock.calls[0][0]).toMatchObject({ tone: "danger" });
    expect(String(confirm.mock.calls[0][0].message)).toContain(
      "cannot be restored",
    );
  });
});
