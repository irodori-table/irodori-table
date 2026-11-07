import { useState } from "react";

// Open/close state for every workbench-level overlay that is not owned by a
// feature store: the command palette, the About dialog, extension tools, the
// AI generate dialog, and the terminal dock. Overlays
// owned by feature stores (settings, schema designer, query history, the
// connection manager) keep their state in those stores; this hook only covers
// surfaces that have no better home.
export function useWorkbenchOverlays() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [activeToolCommandId, setActiveToolCommandId] = useState<string | null>(
    null,
  );
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  return {
    paletteOpen,
    paletteQuery,
    setPaletteQuery,
    openPalette: () => {
      setPaletteQuery("");
      setPaletteOpen(true);
    },
    closePalette: () => setPaletteOpen(false),
    aboutOpen,
    openAbout: () => setAboutOpen(true),
    closeAbout: () => setAboutOpen(false),
    activeToolCommandId,
    openTool: (commandId: string) => setActiveToolCommandId(commandId),
    closeTool: () => setActiveToolCommandId(null),
    aiGenerateOpen,
    openAiGenerate: () => setAiGenerateOpen(true),
    closeAiGenerate: () => setAiGenerateOpen(false),
    terminalOpen,
    toggleTerminal: () => setTerminalOpen((open) => !open),
    closeTerminal: () => setTerminalOpen(false),
  };
}

export type WorkbenchOverlays = ReturnType<typeof useWorkbenchOverlays>;
