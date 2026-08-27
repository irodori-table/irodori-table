import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type MouseEvent,
} from "react";
import { usePopoverPosition } from "@/components/popover";
import { formatKeySequence, type Keymap } from "@/core/keybindings";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

export type WorkbenchContextMenuHandle = {
  open: (event: MouseEvent<HTMLElement>) => void;
  close: () => void;
};

type WorkbenchContextMenuProps = {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  keymap: Keymap;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onRunCommand: (commandId: string) => void;
  onDismissWorkspaceMenus: () => void;
};

type WorkbenchContextMenuState = {
  x: number;
  y: number;
  label: string | null;
  copyText: string | null;
  selectedText: string | null;
  activatable: HTMLElement | null;
  editable: HTMLInputElement | HTMLTextAreaElement | null;
};

export const WorkbenchContextMenu = forwardRef<
  WorkbenchContextMenuHandle,
  WorkbenchContextMenuProps
>(function WorkbenchContextMenu(
  {
    leftSidebarOpen,
    rightSidebarOpen,
    keymap,
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onRunCommand,
    onDismissWorkspaceMenus,
  },
  ref,
) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [contextMenu, setContextMenu] =
    useState<WorkbenchContextMenuState | null>(null);
  // This surface takes its position from the shared primitive (#168): it
  // previously clamped at open time against a guessed 270x246 box.
  const positionedMenu = usePopoverPosition<HTMLDivElement>(
    contextMenu ? { at: "pointer", x: contextMenu.x, y: contextMenu.y } : null,
  );

  const close = () => setContextMenu(null);
  const open = (event: MouseEvent<HTMLElement>) => {
    const target =
      event.target instanceof Element ? event.target : event.currentTarget;

    if (target.closest(".app-menu-popover, .object-action-menu")) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    onDismissWorkspaceMenus();

    const editable = editableTargetFrom(target);
    const activatable = activatableTargetFrom(target);
    const selectedText = cleanContextText(
      window.getSelection()?.toString() ?? "",
    );
    const label = contextLabelFrom(target, activatable, editable);
    const copyText =
      selectedText || editable?.value || readableTextFrom(target) || label;

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      label,
      copyText: copyText || null,
      selectedText: selectedText || null,
      activatable,
      editable,
    });
  };

  useImperativeHandle(ref, () => ({ open, close }));

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  if (!contextMenu) {
    return null;
  }

  const activateContextTarget = () => {
    const target = contextMenu.activatable;
    close();
    if (!target || isDisabledElement(target)) {
      return;
    }
    target.click();
  };
  const clearContextField = () => {
    const target = contextMenu.editable;
    close();
    if (!target || target.readOnly || target.disabled) {
      return;
    }
    target.value = "";
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const copyContextText = (text: string | null) => {
    close();
    if (!text) {
      return;
    }
    void navigator.clipboard?.writeText(text);
  };
  const shortcutFor = (commandId: string) => {
    const shortcut = keymap[commandId];
    return shortcut ? formatKeySequence(shortcut) : null;
  };
  const runMenuCommand = (commandId: string) => {
    close();
    onDismissWorkspaceMenus();
    onRunCommand(commandId);
  };

  return (
    <div
      ref={positionedMenu.ref}
      className="app-menu-popover workbench-context-menu"
      role="menu"
      style={positionedMenu.style}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.activatable ? (
        <button
          type="button"
          role="menuitem"
          disabled={isDisabledElement(contextMenu.activatable)}
          onClick={activateContextTarget}
        >
          <span>
            {contextMenu.label
              ? t("shell.context.activateLabel", {
                  label: contextMenu.label,
                })
              : t("shell.context.activate")}
          </span>
        </button>
      ) : null}
      {contextMenu.selectedText ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => copyContextText(contextMenu.selectedText)}
        >
          <span>{t("shell.context.copySelectedText")}</span>
        </button>
      ) : contextMenu.copyText ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => copyContextText(contextMenu.copyText)}
        >
          <span>
            {contextMenu.editable
              ? t("shell.context.copyValue")
              : t("shell.context.copyText")}
          </span>
        </button>
      ) : null}
      {contextMenu.editable ? (
        <button
          type="button"
          role="menuitem"
          disabled={
            contextMenu.editable.readOnly || contextMenu.editable.disabled
          }
          onClick={clearContextField}
        >
          <span>{t("shell.context.clearField")}</span>
        </button>
      ) : null}
      <span className="menu-separator" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        onClick={() => runMenuCommand("connection.manager")}
      >
        <span>{t("commands.connection.manager.shortTitle")}</span>
        {shortcutFor("connection.manager") ? (
          <kbd>{shortcutFor("connection.manager")}</kbd>
        ) : null}
      </button>
      <span className="menu-separator" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          close();
          onToggleLeftSidebar();
        }}
      >
        <span>
          {leftSidebarOpen
            ? t("shell.hideLeftSidebar")
            : t("shell.showLeftSidebar")}
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          close();
          onToggleRightSidebar();
        }}
      >
        <span>
          {rightSidebarOpen
            ? t("shell.hideRightSidebar")
            : t("shell.showRightSidebar")}
        </span>
      </button>
    </div>
  );
});

function editableTargetFrom(
  target: Element,
): HTMLInputElement | HTMLTextAreaElement | null {
  const editable = target.closest("input, textarea");
  if (
    editable instanceof HTMLInputElement ||
    editable instanceof HTMLTextAreaElement
  ) {
    return editable;
  }
  return null;
}

function activatableTargetFrom(target: Element): HTMLElement | null {
  const activatable = target.closest(
    "button, a, [role='button'], [role='tab'], [role='menuitem'], summary",
  );
  return activatable instanceof HTMLElement ? activatable : null;
}

function contextLabelFrom(
  target: Element,
  activatable: HTMLElement | null,
  editable: HTMLInputElement | HTMLTextAreaElement | null,
) {
  if (editable) {
    return (
      editable.getAttribute("aria-label") ?? editable.placeholder ?? "field"
    );
  }
  const labelTarget =
    activatable ?? target.closest("[aria-label], [title]") ?? target;
  if (!(labelTarget instanceof HTMLElement)) {
    return null;
  }
  return (
    cleanContextText(labelTarget.getAttribute("aria-label") ?? "") ||
    cleanContextText(labelTarget.getAttribute("title") ?? "") ||
    readableTextFrom(labelTarget)
  );
}

function readableTextFrom(target: Element | null) {
  return target ? cleanContextText(target.textContent ?? "") || null : null;
}

function cleanContextText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 160
    ? normalized.slice(0, 157) + "..."
    : normalized;
}

function isDisabledElement(target: HTMLElement) {
  return (
    target.getAttribute("aria-disabled") === "true" ||
    (target instanceof HTMLButtonElement && target.disabled)
  );
}
