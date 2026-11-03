import { Fragment } from "react";
import { createPortal } from "react-dom";
import { useAnchoredMenu } from "@/components/popover";
import { formatKeySequence, type Keymap } from "@/core";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type TranslationKey } from "@/i18n";
import {
  editorContextCommandGroups,
  type EditorContextCommand,
} from "./editor-commands";

export type EditorContextMenuPosition = {
  x: number;
  y: number;
};

export type EditorContextMenuProps = {
  position: EditorContextMenuPosition;
  runPrimaryLabel: string;
  /** The effective keymap (defaults + user overrides) the app dispatches on. */
  keymap: Keymap;
  onCommand: (commandId: string) => void;
  onClose: () => void;
};

export function EditorContextMenu({
  position,
  runPrimaryLabel,
  keymap,
  onCommand,
  onClose,
}: EditorContextMenuProps) {
  // Position and dismissal come from the shared popover primitive (#168). This
  // menu previously set `left`/`top` straight from the pointer with no clamp at
  // all, so a right-click near the bottom-right of the editor opened it partly
  // off-screen — the same failure the tab strip shipped as #115.
  const menu = useAnchoredMenu<HTMLDivElement>(
    { at: "pointer", x: position.x, y: position.y },
    onClose,
  );
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);

  // Every command in editor-commands.ts carries an English `label` for code
  // that has no translator to hand, but each one also already has a
  // commands.<id>.title key in both locales — the menu just never used them, so
  // 15 of its 16 items stayed English under any locale. EditorCommandBar
  // resolves its own labels the same way.
  const commandLabel = (commandId: string, fallback: string) => {
    const key = `commands.${commandId}.title` as TranslationKey;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  // Read from the same keymap the keydown dispatcher resolves against, so a
  // rebind in Settings shows up here instead of a hardcoded default.
  const shortcutFor = (commandId: string) =>
    formatKeySequence(keymap[commandId] ?? "") || null;

  const renderContextCommand = (command: EditorContextCommand) => {
    const label =
      command.commandId === "query.run"
        ? runPrimaryLabel
        : commandLabel(command.commandId, command.label);
    const shortcut = shortcutFor(command.commandId);
    return (
      <button
        type="button"
        role="menuitem"
        key={command.commandId}
        onClick={() => onCommand(command.commandId)}
      >
        <span>{label}</span>
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </button>
    );
  };

  // Rendered through a portal to document.body: the editor lives inside a
  // dockview panel whose ancestors set `transform`/`contain`, which would
  // otherwise become the containing block for this `position: fixed` menu and
  // offset it from the pointer.
  return createPortal(
    <div
      ref={menu.ref}
      className="app-menu-popover editor-context-menu"
      role="menu"
      style={menu.style}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Editor-text actions only: result-grid actions such as the INSERT
          copy/export belong to the results pane's Copy and Export menus and
          the command palette, not to a right-click on SQL text. */}
      {editorContextCommandGroups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span className="menu-separator" aria-hidden="true" />
          ) : null}
          {group.map(renderContextCommand)}
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}
