import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiEngineStatus,
  aiGetProvider,
  aiSetProvider,
} from "@/generated/irodori-api";
import { ProviderPicker } from "@/features/ai/chat/ProviderPicker";
import { cloudProviderConsentStorageKey } from "@/features/ai/provider-disclosure";
import { renderUi } from "@/tests/helpers/render";

vi.mock("@/generated/irodori-api", () => ({
  aiEngineStatus: vi.fn(),
  aiGetProvider: vi.fn(),
  aiSetProvider: vi.fn(),
}));

vi.mock("@/features/ai/chat/chat-bridge", () => ({
  aiDeleteLocalModel: vi.fn(),
  aiUnloadLocal: vi.fn(),
}));

const mockAiEngineStatus = vi.mocked(aiEngineStatus);
const mockAiGetProvider = vi.mocked(aiGetProvider);
const mockAiSetProvider = vi.mocked(aiSetProvider);

beforeEach(() => {
  // The real jsdom Storage is restored in src/tests/setup.ts, so this no longer
  // needs the hand-rolled localStorage stand-in it used to carry (#172).
  window.localStorage.clear();
  mockAiEngineStatus.mockResolvedValue({
    compiled: true,
    modelPresent: true,
    modelFile: "model.gguf",
    modelPath: "/tmp/model.gguf",
    loaded: false,
  });
  mockAiGetProvider.mockResolvedValue({
    kind: "local",
    model: "",
    program: "",
    args: [],
  });
  mockAiSetProvider.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

/** The picker loads its provider state in an effect; wait for that to settle. */
async function renderPicker() {
  const rendered = renderUi(<ProviderPicker />);
  await screen.findByRole("combobox", { name: "Model" });
  return rendered;
}

describe("ProviderPicker", () => {
  it("requires one-time disclosure before saving a cloud provider", async () => {
    const { user } = await renderPicker();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Model" }),
      "openai",
    );

    // Scoped to the disclosure callout: the endpoint also appears in the
    // endpoint field's placeholder, so an unscoped query matches twice.
    const disclosure = screen.getByRole("status");
    expect(
      within(disclosure).getByText("Cloud provider disclosure"),
    ).toBeVisible();
    expect(disclosure).toHaveTextContent("api.openai.com");

    const save = screen.getByRole("button", { name: "Use this model" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "I understand" }));

    expect(window.localStorage.getItem(cloudProviderConsentStorageKey)).toBe(
      "accepted",
    );
    expect(save).toBeEnabled();

    await user.click(save);

    await vi.waitFor(() => {
      expect(mockAiSetProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "openaiCompat",
          endpoint: "https://api.openai.com",
          model: "gpt-4o-mini",
        }),
      );
    });
  });

  it("shows the local-model install hint for Ollama, not for CLI providers", async () => {
    const { user, container } = await renderPicker();
    const preset = screen.getByRole("combobox", { name: "Model" });

    // CLI presets (Claude Code / Codex / Copilot) are cloud-backed agents;
    // they do not install local models, so the hint must stay hidden.
    await user.selectOptions(preset, "claude");
    expect(screen.queryByText(/Install local models/)).not.toBeInTheDocument();

    // Ollama does pull models from a terminal. The full-sentence assertion is
    // also the whitespace regression guard: the copy used to render glued as
    // "withclaude / codexfrom a terminal.".
    await user.selectOptions(preset, "ollama");
    // Asserted on the container because the sentence spans several elements —
    // which is the point: toHaveTextContent collapses whitespace runs but never
    // invents a missing space, so glued copy still fails here.
    expect(container).toHaveTextContent(
      "Install local models with ollama pull from a terminal.",
    );
  });
});
