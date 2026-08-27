import {
  useRef,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import type { AppMenuSection } from "@/app/app-config";
import type { CommandMeta, KeybindingScope, Keymap } from "@/core/keybindings";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type { ThemeKind } from "@/theme";
import type { WorkbenchSide } from "../types";
import {
  WorkbenchContextMenu,
  type WorkbenchContextMenuHandle,
} from "./WorkbenchContextMenu";
import {
  WorkbenchMenubar,
  type WorkbenchMenubarHandle,
} from "./WorkbenchMenubar";
import {
  WorkbenchStatusBar,
  type WorkbenchStatusBarItem,
} from "./WorkbenchStatusBar";

export type { WorkbenchStatusBarItem } from "./WorkbenchStatusBar";

type WorkbenchShellProps = {
  appName: string;
  appVersion?: string;
  themeKind: ThemeKind;
  activeKeyScope: KeybindingScope;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  completionOpen: boolean;
  historyOpen: boolean;
  planOpen: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  resultsHeight: number;
  editorSplitPercent: number;
  workspaceMenuOpen?: boolean;
  menuBarSections: readonly AppMenuSection[];
  commandCatalog: readonly CommandMeta[];
  keymap: Keymap;
  activeConnectionName: string;
  activeConnectionEngine: string;
  activeConnectionColor: string;
  activeConnectionStatus: string;
  activeConnectionOpen: boolean;
  activeTransportLabel: string;
  vimMode: boolean;
  queryLineCount: number;
  sqlLintEnabled: boolean;
  running: boolean;
  selectionStatus: string | null;
  statusBarItems?: readonly WorkbenchStatusBarItem[];
  shellStyle: CSSProperties;
  dockLayout?: boolean;
  /** Far-left connections rail, rendered outside the dock layout. */
  rail?: ReactNode;
  leftSidebar: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
  onScopeFocus: (event: FocusEvent<HTMLElement>) => void;
  onScopeMouseDown: (event: MouseEvent<HTMLElement>) => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onToggleTheme?: () => void;
  onToggleWorkspaceMenu?: () => void;
  onOpenSettings?: () => void;
  onOpenConnectionManager: () => void;
  onOpenHelp?: () => void;
  onRunCommand: (commandId: string) => void;
  onCloseWorkspaceMenu: () => void;
};

// VS Code-style layout toggle: an outlined window frame whose sidebar half
// fills in while that sidebar is open. Lucide only ships the divider-line
// variant, which can't show the open/closed state.
function PanelSideIcon({
  side,
  open,
  size = 15,
}: {
  side: WorkbenchSide;
  open: boolean;
  size?: number;
}) {
  const dividerX = side === "left" ? 9.75 : 14.25;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={3} y={4.5} width={18} height={15} rx={2.2} />
      {open ? (
        <rect
          x={side === "left" ? 3 : 14.25}
          y={4.5}
          width={6.75}
          height={15}
          rx={1.2}
          fill="currentColor"
          stroke="none"
        />
      ) : (
        <line x1={dividerX} y1={4.5} x2={dividerX} y2={19.5} />
      )}
    </svg>
  );
}

export function WorkbenchShell({
  appName,
  themeKind,
  activeKeyScope,
  leftSidebarOpen,
  rightSidebarOpen,
  completionOpen,
  historyOpen,
  planOpen,
  sidebarWidth,
  inspectorWidth,
  resultsHeight,
  editorSplitPercent,
  menuBarSections,
  commandCatalog,
  keymap,
  activeConnectionName,
  activeConnectionEngine,
  activeConnectionColor,
  activeConnectionStatus,
  activeConnectionOpen,
  activeTransportLabel,
  vimMode,
  queryLineCount,
  sqlLintEnabled,
  running,
  selectionStatus,
  statusBarItems = [],
  shellStyle,
  dockLayout = false,
  rail,
  leftSidebar,
  rightSidebar,
  children,
  onScopeFocus,
  onScopeMouseDown,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onOpenConnectionManager,
  onRunCommand,
  onCloseWorkspaceMenu,
}: WorkbenchShellProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const menubarRef = useRef<WorkbenchMenubarHandle>(null);
  const contextMenuRef = useRef<WorkbenchContextMenuHandle>(null);
  const dismissWorkspaceMenus = () => {
    menubarRef.current?.close();
    onCloseWorkspaceMenu();
  };
  const runMenubarCommand = (commandId: string) => {
    contextMenuRef.current?.close();
    onRunCommand(commandId);
  };

  return (
    <main
      className="app-shell"
      style={
        {
          ...shellStyle,
          "--sidebar-width": sidebarWidth + "px",
          "--right-sidebar-width": inspectorWidth + "px",
          "--inspector-width": inspectorWidth + "px",
          "--results-height": resultsHeight + "px",
          "--editor-split-primary": editorSplitPercent + "%",
        } as CSSProperties
      }
      data-theme={themeKind}
      data-key-scope={activeKeyScope}
      onFocusCapture={onScopeFocus}
      onMouseDownCapture={onScopeMouseDown}
      onContextMenu={(event) => contextMenuRef.current?.open(event)}
    >
      <header className="titlebar">
        <div className="titlebar-menu-zone">
          <div className="brand" title={appName} aria-label={appName}>
            <img className="brand-icon" src="/irodori-icon.svg" alt="" />
          </div>
          <WorkbenchMenubar
            ref={menubarRef}
            themeKind={themeKind}
            leftSidebarOpen={leftSidebarOpen}
            completionOpen={completionOpen}
            historyOpen={historyOpen}
            planOpen={planOpen}
            menuBarSections={menuBarSections}
            commandCatalog={commandCatalog}
            keymap={keymap}
            onRunCommand={runMenubarCommand}
            onCloseWorkspaceMenu={onCloseWorkspaceMenu}
          />
        </div>
        <button
          className="connection-select titlebar-connection"
          type="button"
          onClick={onOpenConnectionManager}
        >
          <span
            className="connection-color-dot"
            style={{ background: activeConnectionColor }}
            aria-hidden="true"
          />
          <span>{activeConnectionName}</span>
          <small>{activeConnectionEngine}</small>
          <ChevronDown size={15} />
        </button>
        <div
          className="titlebar-control-zone"
          aria-label={t("shell.layoutControls")}
        >
          <button
            className={[
              "icon-button",
              "layout-toggle-button",
              leftSidebarOpen ? "active" : null,
              "sidebar-left",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            title={
              leftSidebarOpen
                ? t("shell.hideLeftSidebar")
                : t("shell.showLeftSidebar")
            }
            aria-label={
              leftSidebarOpen
                ? t("shell.hideLeftSidebar")
                : t("shell.showLeftSidebar")
            }
            aria-pressed={leftSidebarOpen}
            data-sidebar-toggle="left"
            onClick={onToggleLeftSidebar}
          >
            <PanelSideIcon side="left" open={leftSidebarOpen} />
          </button>
          <button
            className={[
              "icon-button",
              "layout-toggle-button",
              rightSidebarOpen ? "active" : null,
              "sidebar-right",
            ].join(" ")}
            type="button"
            title={
              rightSidebarOpen
                ? t("shell.hideRightSidebar")
                : t("shell.showRightSidebar")
            }
            aria-label={
              rightSidebarOpen
                ? t("shell.hideRightSidebar")
                : t("shell.showRightSidebar")
            }
            aria-pressed={rightSidebarOpen}
            data-sidebar-toggle="right"
            onClick={onToggleRightSidebar}
          >
            <PanelSideIcon side="right" open={rightSidebarOpen} />
          </button>
        </div>
      </header>

      <div
        className={[
          "workspace",
          dockLayout ? "workspace-dock" : null,
          dockLayout || leftSidebarOpen ? null : "left-sidebar-collapsed",
          dockLayout || rightSidebarOpen ? null : "right-sidebar-collapsed",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {rail}
        {dockLayout ? (
          children
        ) : (
          <>
            {leftSidebar}
            {children}
            {rightSidebar}
          </>
        )}
      </div>

      <WorkbenchStatusBar
        activeConnectionColor={activeConnectionColor}
        activeConnectionStatus={activeConnectionStatus}
        activeConnectionOpen={activeConnectionOpen}
        activeTransportLabel={activeTransportLabel}
        vimMode={vimMode}
        queryLineCount={queryLineCount}
        sqlLintEnabled={sqlLintEnabled}
        running={running}
        selectionStatus={selectionStatus}
        statusBarItems={statusBarItems}
        onRunCommand={onRunCommand}
      />

      <WorkbenchContextMenu
        ref={contextMenuRef}
        leftSidebarOpen={leftSidebarOpen}
        rightSidebarOpen={rightSidebarOpen}
        keymap={keymap}
        onToggleLeftSidebar={onToggleLeftSidebar}
        onToggleRightSidebar={onToggleRightSidebar}
        onRunCommand={onRunCommand}
        onDismissWorkspaceMenus={dismissWorkspaceMenus}
      />
    </main>
  );
}
