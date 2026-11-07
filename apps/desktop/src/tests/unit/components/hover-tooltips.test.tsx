import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverTooltips } from "@/components/HoverTooltips";

function renderButton() {
  render(
    <>
      <HoverTooltips />
      <button type="button" title="New table">
        <svg data-testid="icon" />
      </button>
      <button type="button">No title</button>
    </>,
  );
  return screen.getAllByRole("button");
}

describe("HoverTooltips", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const waitForDelay = () => act(() => vi.advanceTimersByTime(400));

  it("shows a control's title after a short hover", () => {
    renderButton();

    fireEvent.mouseOver(screen.getByTestId("icon"));
    expect(screen.queryByRole("tooltip")).toBeNull();

    waitForDelay();
    expect(screen.getByRole("tooltip")).toHaveTextContent("New table");
  });

  it("lifts the title while hovered and restores it on leaving", () => {
    const [titled, plain] = renderButton();

    fireEvent.mouseOver(titled!);
    expect(titled).not.toHaveAttribute("title");

    fireEvent.mouseOver(plain!);
    waitForDelay();
    expect(titled).toHaveAttribute("title", "New table");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps showing while the pointer moves inside the control", () => {
    const [titled] = renderButton();

    fireEvent.mouseOver(titled!);
    waitForDelay();
    fireEvent.mouseOver(screen.getByTestId("icon"));

    expect(screen.getByRole("tooltip")).toHaveTextContent("New table");
  });

  it("gets out of the way when the control is pressed", () => {
    const [titled] = renderButton();

    fireEvent.mouseOver(titled!);
    waitForDelay();
    fireEvent.mouseDown(titled!);

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(titled).toHaveAttribute("title", "New table");
  });

  it("shows the title when a control receives keyboard focus", () => {
    const [titled] = renderButton();

    fireEvent.keyDown(document, { key: "Tab" });
    act(() => titled!.focus());
    waitForDelay();

    expect(screen.getByRole("tooltip")).toHaveTextContent("New table");
    expect(titled).not.toHaveAttribute("title");
  });

  it("restores the title when keyboard focus leaves", () => {
    const [titled] = renderButton();

    fireEvent.keyDown(document, { key: "Tab" });
    act(() => titled!.focus());
    waitForDelay();
    act(() => titled!.blur());

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(titled).toHaveAttribute("title", "New table");
  });

  it("stays quiet when focus came from the pointer", () => {
    const [titled] = renderButton();

    fireEvent.pointerDown(document.body);
    act(() => titled!.focus());
    waitForDelay();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
