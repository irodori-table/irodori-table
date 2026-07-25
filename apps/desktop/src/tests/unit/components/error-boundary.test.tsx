import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { renderUi } from "@/tests/helpers/render";

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error("kaboom");
  return <div className="ok">healthy</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    renderUi(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("healthy")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the fallback (with region) when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderUi(
      <ErrorBoundary region="results panel">
        <Boom explode={true} />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent("results panel");
    expect(alert).toHaveTextContent("kaboom");
    spy.mockRestore();
  });

  it("supports a custom fallback renderer", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderUi(
      <ErrorBoundary
        fallback={(error) => <p className="custom">{error.message}</p>}
      >
        <Boom explode={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("kaboom")).toBeVisible();
    spy.mockRestore();
  });
});
