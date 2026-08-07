import { Fragment } from "react";
import { createPortal } from "react-dom";
import { useAnchoredMenu } from "@/components/popover";
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
  runShortcutLabel: string;
  resultActionsAvailable: boolean;
  onCommand: (commandId: string) => void;
  onClose: () => void;
};

export function EditorContextMenu({
  position,
  runPrimaryLabel,
  runShortcutLabel,
  resultActionsAvailable,
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

  const renderContextCommand = (command: EditorContextCommand) => {
    const label =
      command.commandId === "query.run"
        ? runPrimaryLabel
        : commandLabel(command.commandId, command.label);
    const shortcut =
      command.commandId === "query.run" ? runShortcutLabel : null;
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
      {editorContextCommandGroups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span className="menu-separator" aria-hidden="true" />
          ) : null}
          {group.map(renderContextCommand)}
        </Fragment>
      ))}
      <span className="menu-separator" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        disabled={!resultActionsAvailable}
        onClick={() => onCommand("result.copySqlInserts")}
      >
        <span>{t("commands.result.copySqlInserts.title")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!resultActionsAvailable}
        onClick={() => onCommand("result.exportSqlInserts")}
      >
        <span>{t("commands.result.exportSqlInserts.title")}</span>
      </button>
    </div>,
    document.body,
  );
}
