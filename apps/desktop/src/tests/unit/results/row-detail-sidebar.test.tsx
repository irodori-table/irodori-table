import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
