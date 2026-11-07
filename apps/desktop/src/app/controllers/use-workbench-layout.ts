import { useWorkbenchStore } from "@/features/workbench";

// Dock layout dimensions (persisted in the workbench store) plus the
// drag/keyboard resize controller shared by the sidebars, the results pane,
// and the editor split.
export function useWorkbenchLayout() {
  const sidebarWidth = useWorkbenchStore((state) => state.sidebarWidth);
  const setSidebarWidth = useWorkbenchStore((state) => state.setSidebarWidth);
  const inspectorWidth = useWorkbenchStore((state) => state.inspectorWidth);
  const setInspectorWidth = useWorkbenchStore(
    (state) => state.setInspectorWidth,
  );
  const resultsHeight = useWorkbenchStore((state) => state.resultsHeight);

  return {
    sidebarWidth,
    setSidebarWidth,
    inspectorWidth,
    setInspectorWidth,
    resultsHeight,
  };
}

export type WorkbenchLayout = ReturnType<typeof useWorkbenchLayout>;
