import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorDetails } from "@/components/ErrorDetails";
import { renderUi } from "@/tests/helpers/render";

describe("ErrorDetails", () => {
  it("frames structured backend errors with a summary and raw details", () => {
    renderUi(
      <ErrorDetails
        error={{
          kind: "timeout",
          message: "connect timed out after 30s",
          code: "ETIMEDOUT",
          retryable: true,
        }}
      />,
    );

    expect(screen.getByText("Timed out")).toBeVisible();
    expect(screen.getByText("connect timed out after 30s")).toBeVisible();
    expect(screen.getByText("Details")).toBeVisible();
    // The raw payload sits inside a collapsed <details>, so it is in the
    // document but deliberately not visible until the user opens it.
    expect(screen.getByText(/"kind": "timeout"/)).toBeInTheDocument();
  });

  it("keeps plain string errors compact", () => {
    const { container } = renderUi(<ErrorDetails error="Invalid host" />);

    expect(screen.getByText("Invalid host")).toBeVisible();
    expect(container.querySelector("details")).toBeNull();
  });
});
