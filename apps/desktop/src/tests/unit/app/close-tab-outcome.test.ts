import { describe, expect, it } from "vitest";
import { closeTabOutcome } from "@/app/app-workbench-utils";

/**
 * Ctrl+W on a group that still has tabs closes a tab. Pressed again once the
 * group is empty it closes the connection, the way TablePlus does — and with
 * no connection open there is nothing left to close, which must be a no-op
 * rather than a disconnect of "".
 */
describe("closeTabOutcome", () => {
  it("closes a tab while the group still has one", () => {
    expect(closeTabOutcome(true, "prod")).toEqual({ kind: "tab" });
  });

  it("closes the connection once the group is empty", () => {
    expect(closeTabOutcome(false, "prod")).toEqual({
      kind: "connection",
      connectionId: "prod",
    });
  });

  it("does nothing when the group is empty and no connection is active", () => {
    expect(closeTabOutcome(false, "")).toEqual({ kind: "none" });
  });

  it("still closes a tab when tabs exist without an active connection", () => {
    expect(closeTabOutcome(true, "")).toEqual({ kind: "tab" });
  });
});
