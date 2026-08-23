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
 * icon per **open** connection, with its color tag always visible. A left
 * click switches to that connection, and never a detour through the Connection
 * Manager. Editing and closing live on the right-click menu instead, so the
 * primary click stays one action.
 *
 * It used to list every saved profile, which made "Close connection" look
 * broken — the icon stayed exactly where it was, because the rail was never
 * showing connections in the first place, only the profiles that could become
 * one. The rail now shows the session: closing a connection removes it, and
 * the button at the foot opens the Connection Manager, which is the library of
 * saved profiles and the place to add a new one.
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
  const openProfiles = profiles.filter((profile) =>
    connectedIds.has(profile.id),
  );
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
        {openProfiles.map((profile) => {
          const active = profile.id === activeConnectionId;
          return (
            <button
              key={profile.id}
              type="button"
              role="listitem"
              // Every profile on the rail is connected, so `connected` is no
              // longer a distinction between items — it stays as the class the
              // stylesheet keys the live-dot off.
              className={[
                "connections-rail-item",
                "connected",
                active ? "active" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ "--rail-color": profile.color } as CSSProperties}
              title={`${profile.name} · ${t("rail.connected")}`}
              aria-label={t("rail.switchTo", { name: profile.name })}
              aria-pressed={active}
              onClick={() => {
                setActiveConnectionId(profile.id);
                connectionActions.selectProfile(profile);
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
      {/* Opens the Connection Manager rather than starting a new profile: with
          only open connections on the rail, this is also the only route back
          to a saved-but-closed one. The manager has its own + for new. */}
      <button
        type="button"
        className="connections-rail-item connections-rail-add"
        title={t("rail.openConnection")}
        aria-label={t("rail.openConnection")}
        onClick={() => setConnectionManagerOpen(true)}
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
