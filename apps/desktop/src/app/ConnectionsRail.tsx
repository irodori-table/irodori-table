import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useWorkbenchContext } from "@/app/workbench-context";
import { EngineIcon } from "@/components/EngineIcon";
import { usePopoverPosition } from "@/components/popover";
import { useConnectionStore } from "@/features/connections";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

type RailMenuState = { x: number; y: number; profileId: string } | null;

/**
 * TablePlus-style vertical rail at the far-left edge of the workspace: one
 * icon per saved connection with its color tag always visible. A left click is
 * always "switch to this connection" — it opens the profile if it is closed —
 * and never a detour through the Connection Manager. Editing and closing live
 * on the right-click menu instead, so the primary click stays one action.
 */
export function ConnectionsRail() {
  const { connections } = useWorkbenchContext();
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const profiles = useConnectionStore((state) => state.profiles);
  const {
    activeConnectionId,
    setActiveConnectionId,
    connectedIds,
    setConnectionManagerOpen,
    connectionActions,
  } = connections;
  const [menu, setMenu] = useState<RailMenuState>(null);
  const menuProfile = menu
    ? profiles.find((profile) => profile.id === menu.profileId)
    : undefined;
  const railMenu = usePopoverPosition<HTMLDivElement>(
    menu && menuProfile ? { at: "pointer", x: menu.x, y: menu.y } : null,
  );

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  return (
    <nav className="connections-rail" aria-label={t("rail.connections")}>
      <div className="connections-rail-list" role="list">
        {profiles.map((profile) => {
          const connected = connectedIds.has(profile.id);
          const active = profile.id === activeConnectionId;
          const title = connected
            ? `${profile.name} · ${t("rail.connected")}`
            : profile.name;
          return (
            <button
              key={profile.id}
              type="button"
              role="listitem"
              className={[
                "connections-rail-item",
                active ? "active" : null,
                connected ? "connected" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ "--rail-color": profile.color } as CSSProperties}
              title={title}
              aria-label={t("rail.switchTo", { name: profile.name })}
              aria-pressed={active}
              onClick={() => {
                setActiveConnectionId(profile.id);
                connectionActions.selectProfile(profile);
                if (!connected) {
                  void connectionActions.connectProfile(profile);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  profileId: profile.id,
                });
              }}
            >
              <EngineIcon engine={profile.engine} size={17} />
              <span className="connections-rail-color" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="connections-rail-item connections-rail-add"
        title={t("rail.addConnection")}
        aria-label={t("rail.addConnection")}
        onClick={() => {
          connectionActions.addProfile();
          setConnectionManagerOpen(true);
        }}
      >
        <Plus size={16} />
      </button>
      {/* Portaled for the same reason as the editor tab menu: the rail sits
          inside dockview's transformed overlay, which would otherwise become
          the containing block for this position:fixed menu. */}
      {menu && menuProfile
        ? createPortal(
            <div
              ref={railMenu.ref}
              className="app-menu-popover connections-rail-menu"
              role="menu"
              style={railMenu.style}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  connectionActions.selectProfile(menuProfile);
                  setConnectionManagerOpen(true);
                }}
              >
                <span>{t("rail.editConnection")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!connectedIds.has(menuProfile.id)}
                onClick={() => {
                  setMenu(null);
                  void connectionActions.disconnectProfile(menuProfile.id);
                }}
              >
                <span>{t("rail.closeConnection")}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </nav>
  );
}
