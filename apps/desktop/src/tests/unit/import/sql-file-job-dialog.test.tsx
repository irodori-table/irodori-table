import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SqlFileJobDialog } from "@/features/import/SqlFileJobDialog";
import { dbPickSqlFile, dbFinishSqlFile } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";
import { componentRenderer } from "@/tests/helpers/render";

vi.mock("@/generated/irodori-api", () => ({
  dbPickSqlFile: vi.fn(),
  dbFinishSqlFile: vi.fn(),
}));

const renderDialog = componentRenderer(SqlFileJobDialog, () => ({
  connectionId: "scratch-2",
  connectionName: "Scratch",
  writable: true,
  onStarted: vi.fn(),
  onClose: vi.fn(),
  t: createTranslator("en").t,
}));

beforeEach(() => {
  vi.mocked(dbPickSqlFile).mockReset().mockResolvedValue({
    token: "selection-1",
    database: "test.sqlite",
    name: "restore.sql",
    size: 100000n,
    previewBytes: 4096,
    preview: "-- selected preview",
  });
  vi.mocked(dbFinishSqlFile).mockReset().mockResolvedValue("job-1");
});

describe("SQLite file jobs", () => {
  it("shows the file and bound database before dispatch", async () => {
    const { user, props } = renderDialog();
    const run = screen.getByRole("button", { name: "Run file" });
    expect(run).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Choose SQL file/ }));
    expect(dbPickSqlFile).toHaveBeenCalledWith("scratch-2");
    expect(
      screen.getByText(/Scratch · scratch-2 · test.sqlite/),
    ).toBeInTheDocument();
    expect(screen.getByText("-- selected preview")).toBeInTheDocument();
    expect(dbFinishSqlFile).not.toHaveBeenCalled();
    await user.click(run);
    expect(dbFinishSqlFile).toHaveBeenCalledExactlyOnceWith(
      "scratch-2",
      "selection-1",
      true,
    );
    expect(props.onStarted).toHaveBeenCalledOnce();
  });

  it("discards the review when leaving the target", async () => {
    const { user, unmount } = renderDialog();
    await user.click(screen.getByRole("button", { name: /Choose SQL file/ }));
    unmount();
    expect(dbFinishSqlFile).toHaveBeenCalledExactlyOnceWith(
      "scratch-2",
      "selection-1",
      false,
    );
  });

  it("requires a connected writable SQLite profile", () => {
    renderDialog({ writable: false });
    expect(
      screen.queryByRole("button", { name: /Choose SQL file/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Run file" })).toBeDisabled();
    expect(dbPickSqlFile).not.toHaveBeenCalled();
  });
});
