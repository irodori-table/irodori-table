import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/features/preferences";
import { RowDetailSidebar } from "@/features/results/components/RowDetailSidebar";
import type { DbEngine } from "@/generated/irodori-api";
import { componentRenderer } from "@/tests/helpers/render";

const renderSidebar = componentRenderer(RowDetailSidebar, () => ({
  columns: ["id", "name"],
  values: null,
  table: null,
  metadata: undefined,
  engine: "postgres" as DbEngine,
  connectionId: "local-pg",
  onClose: vi.fn(),
}));

beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("RowDetailSidebar", () => {
  it("stays mounted with an empty state when no row is selected", () => {
    renderSidebar();

    // Twice on purpose: once as the header's field-count summary and once as
    // the body's empty state. The old container.textContent assertion could not
    // tell those apart, which is the blindness #153 set out to remove.
    const empty = screen.getAllByText("No row selected");
    expect(empty).toHaveLength(2);
    for (const node of empty) {
      expect(node).toBeVisible();
    }

    // Both controls stay mounted but inert, so the panel does not resize when a
    // row is picked.
    expect(screen.getByRole("button", { name: /copy/i })).toBeDisabled();
    expect(
      screen.getByRole("searchbox", { name: "Search row fields" }),
    ).toBeDisabled();
  });

  it("renders field rows when a row is selected", () => {
    renderSidebar({ values: [1029, "Kawase Foods"] });

    expect(screen.getByText("2 fields")).toBeVisible();
    expect(screen.getByText("id")).toBeVisible();
    expect(screen.getByText("1029")).toBeVisible();
    expect(screen.getByText("Kawase Foods")).toBeVisible();
  });

  it("copies one field's raw value from its card", async () => {
    const { user } = renderSidebar({
      columns: ["name", "meta", "deleted_at"],
      values: ["Kawase Foods", { tier: "gold", tags: ["a"] }, null],
    });
    // Spy on the clipboard stub user-event's setup() installs; reading it back
    // cannot tell an empty write from no write.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");

    await user.click(screen.getByRole("button", { name: "Copy name" }));
    expect(writeText).toHaveBeenLastCalledWith("Kawase Foods");
    expect(screen.getByRole("button", { name: "Copy name" })).toHaveAttribute(
      "title",
      "Copied",
    );

    await user.click(screen.getByRole("button", { name: "Copy meta" }));
    expect(writeText).toHaveBeenLastCalledWith(
      JSON.stringify({ tier: "gold", tags: ["a"] }, null, 2),
    );

    // NULL renders as a placeholder; the clipboard gets an empty string.
    await user.click(screen.getByRole("button", { name: "Copy deleted_at" }));
    expect(writeText).toHaveBeenLastCalledWith("");
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it("labels the field copy button in Japanese", () => {
    usePreferencesStore.setState({ locale: "ja" });
    renderSidebar({ values: [1029, "Kawase Foods"] });

    expect(
      screen.getByRole("button", { name: "name をコピー" }),
    ).toBeInTheDocument();
  });
});
