import { describe, expect, it, vi } from "vitest";
import {
  useResultGridEditing,
  type ResultGridEditingDeps,
} from "@/app/controllers/use-result-grid-editing";
import type {
  DatabaseMetadata,
  QueryResult,
  QueryResultSet,
} from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";

/**
 * A double-click on a result cell starts editing it, switching the grid into
 * edit mode first; it used to do nothing until Edit data had been pressed.
 * Results that cannot be written back are left alone.
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

describe("double-clicking a result cell", () => {
  it("enters edit mode and edits that cell", () => {
    const { actions, spy } = editing({});

    actions.beginCellEdit("o0", 1);

    expect(spy("setEditMode")).toHaveBeenCalledWith(true);
    expect(spy("selectGridCell")).toHaveBeenCalledWith("o0", 1);
    expect(spy("setEditingCell")).toHaveBeenCalledWith({ key: "o0", col: 1 });
  });

  it("leaves a result that cannot be written back alone", () => {
    const { actions, spy } = editing({
      lastRunSql: "select m.id, m.kind from memories m join users u on true",
    });

    actions.beginCellEdit("o0", 1);

    expect(spy("setEditMode")).not.toHaveBeenCalled();
    expect(spy("setEditingCell")).not.toHaveBeenCalled();
  });

  it("does not edit on a read-only connection", () => {
    const { actions, spy } = editing({ activeConnectionReadOnly: true });

    actions.beginCellEdit("o0", 1);

    expect(spy("setEditMode")).not.toHaveBeenCalled();
    expect(spy("setEditingCell")).not.toHaveBeenCalled();
  });
});
