import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiEngineStatus,
  aiGetProvider,
  type DbEngine,
} from "@/generated/irodori-api";
import { AiGenerateDialog } from "@/features/ai/AiGenerateDialog";
import { renderUi } from "@/tests/helpers/render";

vi.mock("@/generated/irodori-api", () => ({
  aiEngineStatus: vi.fn(),
  aiGenerateSql: vi.fn(),
  aiGetProvider: vi.fn(),
  aiSetProvider: vi.fn(),
}));

const mockAiEngineStatus = vi.mocked(aiEngineStatus);
const mockAiGetProvider = vi.mocked(aiGetProvider);

beforeEach(() => {
  mockAiEngineStatus.mockResolvedValue({
    compiled: false,
    modelPresent: false,
    modelFile: "",
    modelPath: "",
    loaded: false,
  });
  mockAiGetProvider.mockResolvedValue({
    kind: "local",
    model: "",
    program: "",
    args: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AiGenerateDialog", () => {
  it("renders the not-compiled notice as one readable sentence", async () => {
    const { container } = renderUi(
      <AiGenerateDialog
        open
        onClose={() => {}}
        connectionId="c1"
        engine={"postgres" as DbEngine}
        onInsert={() => {}}
        notify={() => {}}
      />,
    );

    // Regression: the sentence was split across two locale keys and a <code>
    // element, and JSX whitespace trimming rendered it glued together as
    // "into this--features llamabuild.". Asserted on the container because it
    // spans elements by design — toHaveTextContent collapses whitespace runs
    // but never invents a missing space, so glued copy still fails.
    await vi.waitFor(() => {
      expect(container).toHaveTextContent(
        "AI generation is not compiled into this --features llama build.",
      );
    });
  });
});
