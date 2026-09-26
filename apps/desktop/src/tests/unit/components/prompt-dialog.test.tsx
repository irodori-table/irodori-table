import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptDialog, usePrompt } from "@/components/PromptDialog";
import { usePreferencesStore } from "@/features/preferences";
import { renderUi } from "@/tests/helpers/render";

function PromptHost({
  onReady,
}: {
  onReady: (prompt: ReturnType<typeof usePrompt>["prompt"]) => void;
}) {
  const { prompt, promptElement } = usePrompt();
  onReady(prompt);
  return <>{promptElement}</>;
}

// Default button labels come from t("common.confirm"/"common.cancel"), so the
// locale has to be pinned or the queries below depend on machine settings.
beforeEach(() => {
  usePreferencesStore.setState({ locale: "en" });
});

describe("PromptDialog", () => {
  it("seeds the input and routes submit/cancel callbacks", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { user } = renderUi(
      <PromptDialog
        title="Rename SQL tab"
        label="Tab name"
        defaultValue="sample.sql"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Rename SQL tab");
    expect(screen.getByRole("textbox")).toHaveValue("sample.sql");

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "renamed.sql");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onSubmit).toHaveBeenCalledWith("renamed.sql");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables confirm while the field is empty", () => {
    renderUi(
      <PromptDialog
        title="Rename SQL tab"
        label="Tab name"
        defaultValue="   "
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("usePrompt resolves the trimmed value on submit", async () => {
    let prompt!: ReturnType<typeof usePrompt>["prompt"];
    const { user } = renderUi(
      <PromptHost
        onReady={(value) => {
          prompt = value;
        }}
      />,
    );

    let pending!: Promise<string | null>;
    act(() => {
      pending = prompt({ title: "Rename SQL tab", label: "Tab name" });
    });
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.type(screen.getByRole("textbox"), "  orders.sql  ");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await expect(pending).resolves.toBe("orders.sql");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("usePrompt resolves null on cancel", async () => {
    let prompt!: ReturnType<typeof usePrompt>["prompt"];
    const { user } = renderUi(
      <PromptHost
        onReady={(value) => {
          prompt = value;
        }}
      />,
    );

    let pending!: Promise<string | null>;
    act(() => {
      pending = prompt({ title: "Rename SQL tab", label: "Tab name" });
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(pending).resolves.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
