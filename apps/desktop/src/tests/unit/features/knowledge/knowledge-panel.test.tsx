import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgePanel } from "@/features/knowledge/KnowledgePanel";
import type { KnowledgePack } from "@/features/knowledge/knowledge-pack";
import { usePreferencesStore } from "@/features/preferences";
import type { DbEngine } from "@/generated/irodori-api";
import { componentRenderer } from "@/tests/helpers/render";

// Mirror how KnowledgePanel renders pack.updatedAt (a plain local date, not the
// raw ISO), so the assertions stay correct across locales and time zones.
const expectedUpdatedAt = (iso: string) =>
  new Date(iso).toLocaleDateString(usePreferencesStore.getState().locale, {
    dateStyle: "medium",
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

const samplePack: KnowledgePack = {
  schemaVersion: 1,
  updatedAt: "2026-07-11T00:00:00Z",
  source: "test-knowledge-pack",
  products: [
    {
      product: "PostgreSQL",
      engineId: "postgres",
      facts: [
        {
          area: "sql_dialect",
          title: "PostgreSQL: MERGE improvements",
          summary: "MERGE gained RETURNING support in the current release.",
          priority: "high",
          confidence: "medium",
          observedAt: "2026-07-01T00:00:00Z",
          url: "https://www.postgresql.org/docs/current/",
          sourceId: "postgres-docs-current",
        },
        {
          area: "auth",
          title: "PostgreSQL: SCRAM notes",
          summary: "Authentication docs describe SCRAM channel binding.",
          priority: "normal",
          confidence: "high",
          observedAt: "2026-07-01T00:00:00Z",
        },
      ],
    },
    {
      product: "DBeaver",
      facts: [
        {
          area: "client_market",
          title: "DBeaver: release cadence",
          summary: "Client release notes track monthly feature drops.",
          priority: "low",
          confidence: "medium",
          observedAt: "2026-07-01T00:00:00Z",
        },
      ],
    },
  ],
};

const renderPanel = componentRenderer(KnowledgePanel, () => ({
  editorEngine: "postgres" as DbEngine,
  activeConnectionName: "Local Postgres",
  onClose: vi.fn(),
  initialPack: samplePack,
}));

const ALL_FACT_TITLES = [
  "PostgreSQL: MERGE improvements",
  "PostgreSQL: SCRAM notes",
  "DBeaver: release cadence",
];

/**
 * Fact titles as a user sees them. Queried by text rather than by
 * `.knowledge-fact strong`, so a markup change that hides a fact — or moves it
 * out of the list — fails here instead of passing on a still-present node
 * (#153, #172).
 */
function visibleFactTitles(): string[] {
  return ALL_FACT_TITLES.filter((title) => screen.queryByText(title) !== null);
}

describe("KnowledgePanel", () => {
  it("scopes facts to the active connection engine by default", () => {
    renderPanel();

    expect(visibleFactTitles()).toEqual([
      "PostgreSQL: MERGE improvements",
      "PostgreSQL: SCRAM notes",
    ]);
    expect(screen.getByText(/Local Postgres/)).toBeVisible();
    expect(
      screen.getByText(new RegExp(expectedUpdatedAt("2026-07-11T00:00:00Z"))),
    ).toBeVisible();
  });

  it("shows every product when the scope is switched to all", async () => {
    const { user } = renderPanel();

    await user.click(screen.getByRole("radio", { name: "All products" }));

    expect(visibleFactTitles()).toEqual(ALL_FACT_TITLES);
  });

  it("falls back to all products with a callout when the engine has no facts", () => {
    renderPanel({ editorEngine: "mysql" });

    expect(visibleFactTitles()).toEqual(ALL_FACT_TITLES);
    expect(screen.getByText(/no .*facts|No facts/i)).toBeVisible();
  });

  it("filters facts by substring across title and summary", async () => {
    const { user } = renderPanel();
    const filter = screen.getByRole("searchbox", { name: "Filter facts" });

    await user.type(filter, "scram");
    expect(visibleFactTitles()).toEqual(["PostgreSQL: SCRAM notes"]);

    await user.clear(filter);
    await user.type(filter, "no-such-fact");
    expect(visibleFactTitles()).toEqual([]);
    expect(screen.getByText(/No facts match/)).toBeVisible();
  });

  it("renders priority badges and official source links", () => {
    renderPanel();

    expect(screen.getByText("high")).toBeVisible();
    // The anchor's aria-label deliberately overrides its visible text, so the
    // accessible name is the generic "open the source" phrasing and the id is
    // asserted as content.
    const link = screen.getByRole("link", {
      name: "Open the official source page",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://www.postgresql.org/docs/current/",
    );
    expect(link).toHaveTextContent("postgres-docs-current");
  });

  it("replaces the pack after a successful refresh", async () => {
    const nextPack: KnowledgePack = {
      ...samplePack,
      updatedAt: "2026-08-01T00:00:00Z",
      products: [
        {
          product: "PostgreSQL",
          engineId: "postgres",
          facts: [samplePack.products[0].facts[0]],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => nextPack }),
    );

    const { user } = renderPanel();
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await vi.waitFor(() => {
      expect(
        screen.getByText(new RegExp(expectedUpdatedAt("2026-08-01T00:00:00Z"))),
      ).toBeVisible();
    });
    expect(visibleFactTitles()).toEqual(["PostgreSQL: MERGE improvements"]);
  });

  it("keeps the bundled pack and shows an error when refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { user } = renderPanel();
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await vi.waitFor(() => {
      expect(screen.getByText(/offline/)).toBeVisible();
    });
    expect(visibleFactTitles()).toEqual([
      "PostgreSQL: MERGE improvements",
      "PostgreSQL: SCRAM notes",
    ]);
  });

  it("closes from the header button", async () => {
    const { user, props } = renderPanel();

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
