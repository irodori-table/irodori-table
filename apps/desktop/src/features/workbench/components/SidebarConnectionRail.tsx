import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  popoverSurfaceStyle,
  usePopoverPosition,
  type PopoverAnchor,
} from "@/components/popover";
import { EngineIcon } from "@/components/EngineIcon";
import { Plus } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type {
  ConnectionDraft,
  WorkspaceConnection,
} from "@/lib/workspace-connection";

type SidebarConnectionRailProps = {
  show: boolean;
  connections: WorkspaceConnection[];
  profileById: ReadonlyMap<string, ConnectionDraft>;
  connectionColorFallback: string;
  activeConnectionId: string;
  activeConnectionOpen: boolean;
  connectedIds: ReadonlySet<string>;
  onAddProfile: () => void;
  onOpenConnectionManager: () => void;
  onSelectConnection: (
    connection: WorkspaceConnection,
    profile: ConnectionDraft | undefined,
  ) => void;
  onRefreshObjects: () => void;
};

export function SidebarConnectionRail({
  show,
  connections,
  profileById,
  connectionColorFallback,
  activeConnectionId,
  activeConnectionOpen,
  connectedIds,
  onAddProfile,
  onOpenConnectionManager,
  onSelectConnection,
  onRefreshObjects,
}: SidebarConnectionRailProps) {
  const [connectionMenu, setConnectionMenu] = useState<{
    id: string;
    anchor: PopoverAnchor;
  } | null>(null);
  const connectionMenuPopover = usePopoverPosition<HTMLDivElement>(
    connectionMenu?.anchor ?? null,
  );
  const connectionMenuRef = connectionMenuPopover.ref;
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);

  useEffect(() => {
    if (!connectionMenu) {
      return;
    }
    const close = () => setConnectionMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        connectionMenuRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [connectionMenu]);

  if (!show) {
    return null;
  }

  const menuConnection = connectionMenu
    ? connections.find((connection) => connection.id === connectionMenu.id)
    : undefined;
  const menuProfile = menuConnection
    ? profileById.get(menuConnection.id)
    : undefined;
  const menuConnectionIsActive = menuConnection?.id === activeConnectionId;

  return (
    <nav className="connection-rail" aria-label={t("rail.connections")}>
      <button
        className="rail-action"
        type="button"
        title={t("connection.newConnection")}
        aria-label={t("connection.newConnection")}
        onClick={onAddProfile}
      >
        <Plus size={16} />
      </button>
      <div className="rail-connection-list">
        {connections.map((connection) => {
          const profile = profileById.get(connection.id);
          const active = connection.id === activeConnectionId;
          const connected = connectedIds.has(connection.id);
          return (
            <button
              className={`rail-connection${active ? " active" : ""}`}
              key={connection.id}
              type="button"
              title={`${connection.name} · ${connection.engine} · ${
                connected ? t("rail.statusConnected") : t("rail.statusClosed")
              }`}
              aria-label={t("rail.switchTo", { name: connection.name })}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelectConnection(connection, profile)}
              onDoubleClick={onOpenConnectionManager}
              onContextMenu={(event) => {
                event.preventDefault();
                // Keep the shell's generic menu from opening on top of this one.
                event.stopPropagation();
                setConnectionMenu({
                  id: connection.id,
                  anchor: {
                    at: "pointer",
                    x: event.clientX,
                    y: event.clientY,
                  },
                });
              }}
            >
              <EngineIcon engine={connection.engine} size={17} />
              <span
                className="connection-color-dot"
                style={{
                  background: profile?.color || connectionColorFallback,
                }}
                aria-hidden="true"
              />
              <i className={connected ? "connected" : ""} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {connectionMenu && menuConnection
        ? createPortal(
            <div
              ref={connectionMenuRef}
              className="object-action-menu"
              role="menu"
              style={{
                ...popoverSurfaceStyle,
                ...connectionMenuPopover.style,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectConnection(menuConnection, menuProfile);
                  setConnectionMenu(null);
                }}
              >
                {connectedIds.has(menuConnection.id)
                  ? t("sidebar.menu.switchToConnection")
                  : t("sidebar.menu.connect")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectConnection(menuConnection, menuProfile);
                  onOpenConnectionManager();
                  setConnectionMenu(null);
                }}
              >
                {t("sidebar.menu.editConnection")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!menuConnectionIsActive || !activeConnectionOpen}
                onClick={() => {
                  onRefreshObjects();
                  setConnectionMenu(null);
                }}
              >
                {t("sidebar.refreshObjects")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard?.writeText(menuConnection.name);
                  setConnectionMenu(null);
                }}
              >
                {t("sidebar.menu.copyName")}
              </button>
              {menuProfile?.url ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void navigator.clipboard?.writeText(menuProfile.url);
                    setConnectionMenu(null);
                  }}
                >
                  {t("sidebar.menu.copyConnectionString")}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </nav>
  );
}
