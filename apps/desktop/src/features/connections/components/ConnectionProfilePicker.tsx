import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import {
  popoverSurfaceStyle,
  usePopoverPosition,
  type PopoverRect,
} from "@/components/popover";
import type { Translator } from "@/i18n";
import type { ConnectionProfileGroup } from "../connection-groups";
import { engineLabel, type ConnectionDraft } from "../connection-profiles";
import {
  connectionTransferFormatOptions,
  type ConnectionTransferFormat,
} from "../connection-transfer";
import type { ConnectionSelection } from "../use-connection-selection";

type ConnectionProfilePickerProps = {
  profiles: ConnectionDraft[];
  connectedIds: Set<string>;
  selectedProfileId: string;
  search: string;
  selection: ConnectionSelection;
  t: Translator["t"];
  onSearchChange: (value: string) => void;
  onAddProfile: () => void;
  onImportProfiles: (file: File) => void;
  onExportProfiles: (format: ConnectionTransferFormat) => void;
  onSelectProfile: (profile: ConnectionDraft) => void;
  onOpenSqliteSample: () => void;
};

/**
 * The dialog's left column: the grouped list of saved profiles with its
 * search, import/export menu, and per-row context menu.
 */
export function ConnectionProfilePicker({
  profiles,
  connectedIds,
  selectedProfileId,
  search,
  selection,
  t,
  onSearchChange,
  onAddProfile,
  onImportProfiles,
  onExportProfiles,
  onSelectProfile,
  onOpenSqliteSample,
}: ConnectionProfilePickerProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // Right-click menu for the profile list: bulk actions live here rather than in
  // a footer button whose "(14)" count read as noise. Anchored at the cursor and
  // portaled to <body> because the dialog clips overflowing children.
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    profileId: string;
  } | null>(null);
  // Placed and clamped by the shared primitive (#168); it had no clamp of its
  // own, so a row near the bottom of a tall list opened partly off-screen.
  const rowPopover = usePopoverPosition<HTMLDivElement>(
    rowMenu ? { at: "pointer", x: rowMenu.x, y: rowMenu.y } : null,
  );
  const rowMenuRef = rowPopover.ref;

  useEffect(() => {
    if (!rowMenu) {
      return;
    }
    const close = () => setRowMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setRowMenu(null);
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rowMenuRef.current?.contains(target)) {
        return;
      }
      setRowMenu(null);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [rowMenu]);

  function handleProfileListKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Delete") {
      return;
    }
    event.preventDefault();
    selection.requestDeleteSelected();
  }

  function renderProfile(profile: ConnectionDraft) {
    const connected = connectedIds.has(profile.id);
    const selected = selection.selectedIds.has(profile.id);
    const classNames = ["connection-profile"];
    if (profile.id === selectedProfileId) {
      classNames.push("active");
    }
    if (selected) {
      classNames.push("selected");
    }
    return (
      <button
        key={profile.id}
        className={classNames.join(" ")}
        type="button"
        aria-pressed={selected}
        onClick={(event) => selection.handleProfileClick(event, profile)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          selection.retargetSelection(profile.id);
          setRowMenu({
            x: event.clientX,
            y: event.clientY,
            profileId: profile.id,
          });
        }}
      >
        <span
          className="connection-color-dot"
          style={{ background: profile.color }}
          aria-hidden="true"
        />
        <span>
          <strong>{profile.name}</strong>
          <small>
            {engineLabel(profile.engine)}
            {profile.database ? " · " + profile.database : ""}
            {profile.readOnly ? " · " + t("connection.readOnlyBadge") : ""}
          </small>
        </span>
        <i className={connected ? "connected" : ""} />
      </button>
    );
  }

  function renderGroup(group: ConnectionProfileGroup) {
    const collapsed = selection.collapsedGroups.has(group.id);
    const connectedCount = group.profiles.filter((profile) =>
      connectedIds.has(profile.id),
    ).length;
    return (
      <section className="connection-profile-group" key={group.id}>
        <button
          className="connection-profile-group-header"
          type="button"
          aria-expanded={!collapsed}
          onClick={() => selection.toggleGroup(group.id)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>
            <strong>{t(group.labelKey)}</strong>
            <small>
              {connectedCount > 0
                ? t("connection.group.connectedCount", {
                    connected: connectedCount,
                    total: group.profiles.length,
                  })
                : t("connection.group.totalCount", {
                    total: group.profiles.length,
                  })}
            </small>
          </span>
        </button>
        {collapsed ? null : (
          <div className="connection-profile-group-items">
            {group.profiles.map(renderProfile)}
          </div>
        )}
      </section>
    );
  }

  return (
    <aside className="connection-picker">
      <div className="connection-picker-header">
        <button
          className="icon-button"
          type="button"
          title={t("connection.newConnection")}
          aria-label={t("connection.newConnection")}
          onClick={onAddProfile}
        >
          <Plus size={16} />
        </button>
        <ConnectionTransferMenu
          canExport={profiles.length > 0}
          t={t}
          onImport={() => importInputRef.current?.click()}
          onExport={onExportProfiles}
        />
        <label className="connection-search">
          <Search size={15} />
          <input
            autoFocus
            value={search}
            placeholder={t("connection.searchPlaceholder")}
            aria-label={t("connection.searchPlaceholder")}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>
        <input
          ref={importInputRef}
          className="hidden-file-input"
          type="file"
          accept=".json,.xml,.csv,.ini,.txt,.conf,.tableplusconnection"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              onImportProfiles(file);
            }
          }}
        />
      </div>
      <div
        className="connection-profile-list"
        onKeyDown={handleProfileListKeyDown}
      >
        {selection.groupedProfiles.map(renderGroup)}
      </div>
      <div className="connection-picker-empty">
        {profiles.length === 0
          ? search.trim().length > 0
            ? t("connection.noMatches")
            : t("connection.emptyState")
          : null}
      </div>
      {/* A database to look at when you have none of your own. It belongs
          here, next to the list it is a sample of, rather than in the
          workbench where it outranked opening a real connection. */}
      <button
        type="button"
        className="text-button connection-sample"
        onClick={onOpenSqliteSample}
      >
        {t("connection.openSqliteSample")}
      </button>
      {rowMenu
        ? createPortal(
            <div
              ref={rowMenuRef}
              className="connection-action-menu"
              role="menu"
              style={{ ...popoverSurfaceStyle, ...rowPopover.style }}
            >
              {selection.selectedIds.size > 1 ? (
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setRowMenu(null);
                    selection.requestDeleteSelected();
                  }}
                >
                  <span>
                    {t("connection.deleteSelected", {
                      count: selection.selectedIds.size,
                    })}
                  </span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const profile = profiles.find(
                        (item) => item.id === rowMenu.profileId,
                      );
                      setRowMenu(null);
                      if (profile) {
                        onSelectProfile(profile);
                      }
                    }}
                  >
                    <span>{t("connection.editConnection")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setRowMenu(null);
                      selection.requestDeleteSelected();
                    }}
                  >
                    <span>{t("common.delete")}</span>
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </aside>
  );
}

/** The "…" button and its import/export popover. */
function ConnectionTransferMenu({
  canExport,
  t,
  onImport,
  onExport,
}: {
  canExport: boolean;
  t: Translator["t"];
  onImport: () => void;
  onExport: (format: ConnectionTransferFormat) => void;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  // Anchored below the "…" button but portaled to <body>: the dialog clips
  // overflowing children, which previously cut this menu off.
  const [menu, setMenu] = useState<PopoverRect | null>(null);
  const open = menu !== null;
  const popover = usePopoverPosition<HTMLDivElement>(
    menu ? { at: "element", rect: menu } : null,
  );
  const menuRef = popover.ref;

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setMenu(null);
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (menuRef.current?.contains(target) ||
          anchorRef.current?.contains(target))
      ) {
        return;
      }
      setMenu(null);
    };
    const closeOnBlur = () => setMenu(null);
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [open]);

  return (
    <div className="connection-action-menu-wrap" ref={anchorRef}>
      <button
        className={open ? "icon-button active" : "icon-button"}
        type="button"
        title={t("connection.importExport")}
        aria-label={t("connection.importExport")}
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu((current) => (current ? null : rect));
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="connection-action-menu"
              role="menu"
              style={{ ...popoverSurfaceStyle, ...popover.style }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onImport();
                }}
              >
                <span>{t("connection.importConnections")}</span>
                <Upload size={13} />
              </button>
              <span className="connection-action-menu-separator" />
              {connectionTransferFormatOptions.map((format) => (
                <button
                  key={format.value}
                  type="button"
                  role="menuitem"
                  disabled={!canExport}
                  title={t("connection.noPasswords")}
                  onClick={() => {
                    setMenu(null);
                    onExport(format.value);
                  }}
                >
                  <span>
                    {t("connection.exportFormat", { format: format.label })}
                  </span>
                </button>
              ))}
              {/* One quiet note for the whole export list instead of
                  stamping "no passwords" onto every row. */}
              <span className="connection-action-menu-note">
                {t("connection.noPasswords")}
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
