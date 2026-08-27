import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

export type WorkbenchStatusBarItem = {
  id: string;
  label: string;
  alignment?: "left" | "right";
  priority?: number;
  command?: string;
  tooltip?: string;
};

type WorkbenchStatusBarProps = {
  activeConnectionColor: string;
  activeConnectionStatus: string;
  activeConnectionOpen: boolean;
  activeTransportLabel: string;
  vimMode: boolean;
  queryLineCount: number;
  sqlLintEnabled: boolean;
  running: boolean;
  selectionStatus: string | null;
  statusBarItems: readonly WorkbenchStatusBarItem[];
  onRunCommand: (commandId: string) => void;
};

export function WorkbenchStatusBar({
  activeConnectionColor,
  activeConnectionStatus,
  activeConnectionOpen,
  activeTransportLabel,
  vimMode,
  queryLineCount,
  sqlLintEnabled,
  running,
  selectionStatus,
  statusBarItems,
  onRunCommand,
}: WorkbenchStatusBarProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const sortedStatusBarItems = [...statusBarItems].sort(
    (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
  );
  const leftStatusBarItems = sortedStatusBarItems.filter(
    (item) => item.alignment !== "right",
  );
  const rightStatusBarItems = sortedStatusBarItems.filter(
    (item) => item.alignment === "right",
  );
  const renderStatusBarItem = (item: WorkbenchStatusBarItem) => {
    const title = item.tooltip ?? item.label;
    if (item.command) {
      return (
        <button
          className="statusbar-item statusbar-button"
          type="button"
          title={title}
          key={item.id}
          onClick={() => onRunCommand(item.command ?? "")}
        >
          {item.label}
        </button>
      );
    }
    return (
      <span className="statusbar-item" title={title} key={item.id}>
        {item.label}
      </span>
    );
  };

  return (
    <footer className="statusbar">
      <div className="statusbar-group statusbar-left">
        <span className="statusbar-item statusbar-connection">
          {/* Next to the connection state this dot reads as a status light,
              not as the profile's color tag, so it only carries the profile
              color while the connection is actually open; CSS greys it out
              otherwise. */}
          <span
            className="connection-color-dot"
            data-connected={activeConnectionOpen ? "true" : "false"}
            style={
              activeConnectionOpen
                ? { background: activeConnectionColor }
                : undefined
            }
            aria-hidden="true"
          />
          {activeConnectionStatus}
        </span>
        <span className="statusbar-item">{activeTransportLabel}</span>
        {leftStatusBarItems.map(renderStatusBarItem)}
      </div>
      {selectionStatus ? (
        <span className="statusbar-selection">{selectionStatus}</span>
      ) : null}
      <div className="statusbar-group statusbar-right">
        {rightStatusBarItems.map(renderStatusBarItem)}
        <span className="statusbar-item">
          {vimMode ? t("shell.editorMode.vim") : t("shell.editorMode.default")}{" "}
          · {t("shell.lineCount", { count: queryLineCount })} ·{" "}
          {sqlLintEnabled ? t("shell.lintOn") : t("shell.lintOff")} ·{" "}
          {running ? t("shell.running") : t("shell.idle")}
        </span>
      </div>
    </footer>
  );
}
