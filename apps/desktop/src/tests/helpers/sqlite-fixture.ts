import { vi } from "vitest";

export async function openSqliteFixture() {
  // node:sqlite is provided by the project's pinned Node 24 test runtime.
  const { DatabaseSync } = await vi.importActual<{
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): { get(): unknown; all(): unknown[] };
      close(): void;
    };
  }>("node:sqlite");
  return new DatabaseSync(":memory:");
}
