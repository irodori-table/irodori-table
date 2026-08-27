import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { AppMenuSection } from "@/app/app-config";
import { usePopoverPosition, type PopoverRect } from "@/components/popover";
import {
  formatKeySequence,
  type CommandMeta,
  type Keymap,
} from "@/core/keybindings";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type { ThemeKind } from "@/theme";

export type WorkbenchMenubarHandle = {
  close: () => void;
};

type WorkbenchMenubarProps = {
  themeKind: ThemeKind;
  leftSidebarOpen: boolean;
  completionOpen: boolean;
  historyOpen: boolean;
  planOpen: boolean;
  menuBarSections: readonly AppMenuSection[];
  commandCatalog: readonly CommandMeta[];
  keymap: Keymap;
  onRunCommand: (commandId: string) => void;
  onCloseWorkspaceMenu: () => void;
};

export const WorkbenchMenubar = forwardRef<
  WorkbenchMenubarHandle,
  WorkbenchMenubarProps
>(function WorkbenchMenubar(
  {
    themeKind,
    leftSidebarOpen,
    completionOpen,
    historyOpen,
    planOpen,
    menuBarSections,
    commandCatalog,
    keymap,
    onRunCommand,
    onCloseWorkspaceMenu,
  },
  ref,
) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [activeMenuLabel, setActiveMenuLabel] = useState<string | null>(null);
  // The menu bar dropdown is portaled to <body> and positioned from the
  // anchor button's rect: the titlebar/menubar set overflow to hidden to clip
  // horizontal label overflow, which would otherwise also clip the dropdown.
  const [menuAnchor, setMenuAnchor] = useState<PopoverRect | null>(null);
  const menubarRef = useRef<HTMLElement | null>(null);
  // The dropdown takes its position from the shared primitive (#168): it
  // previously had no viewport clamp at all.
  const menubarMenu = usePopoverPosition<HTMLDivElement>(
    activeMenuLabel && menuAnchor
      ? { at: "element", rect: menuAnchor, gap: 1 }
      : null,
  );
  const menuPopoverRef = menubarMenu.ref;
  const menubarButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Where keyboard focus should land inside the popover once it renders.
  const pendingMenuFocusRef = useRef<"first" | "last" | null>(null);
  // Menu label switched to via hover while another menu was open: the click
  // that follows must not toggle it closed again.
  const hoverSwitchedLabelRef = useRef<string | null>(null);
  // Roving tabindex home for the menubar (APG menubar pattern).
  const [menubarFocusLabel, setMenubarFocusLabel] = useState<string | null>(
    null,
  );

  const openMenuFromButton = (label: string, button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    // The whole rect, not a pre-computed corner: the primitive needs both edges
    // to clamp a dropdown opened from a button near the right of the menubar.
    setMenuAnchor({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    });
    setActiveMenuLabel(label);
    setMenubarFocusLabel(label);
  };

  const closeMenuBarMenu = () => {
    setActiveMenuLabel(null);
    setMenuAnchor(null);
    pendingMenuFocusRef.current = null;
    hoverSwitchedLabelRef.current = null;
  };

  useImperativeHandle(ref, () => ({ close: closeMenuBarMenu }));

  const menuPopoverItems = () =>
    Array.from(
      menuPopoverRef.current?.querySelectorAll<HTMLElement>(
        "button[role='menuitem']:not(:disabled)",
      ) ?? [],
    );

  // Move keyboard focus into the popover after an open triggered by
  // ArrowDown/ArrowUp/Enter on a menubar button or by Left/Right switching.
  useEffect(() => {
    const target = pendingMenuFocusRef.current;
    if (!target || !activeMenuLabel) {
      return;
    }
    pendingMenuFocusRef.current = null;
    const items = menuPopoverItems();
    if (items.length === 0) {
      return;
    }
    (target === "first" ? items[0] : items[items.length - 1]).focus();
  }, [activeMenuLabel]);

  const focusMenubarButtonAt = (index: number) => {
    const count = menuBarSections.length;
    if (count === 0) {
      return;
    }
    const section = menuBarSections[((index % count) + count) % count];
    const button = menubarButtonRefs.current.get(section.label);
    if (!button) {
      return;
    }
    setMenubarFocusLabel(section.label);
    button.focus();
    // While a menu is open, moving along the menubar switches the open menu.
    if (activeMenuLabel && activeMenuLabel !== section.label) {
      openMenuFromButton(section.label, button);
    }
  };

  const switchToAdjacentMenu = (delta: number) => {
    const index = menuBarSections.findIndex(
      (section) => section.label === activeMenuLabel,
    );
    if (index === -1) {
      return;
    }
    const count = menuBarSections.length;
    const next = menuBarSections[(index + delta + count) % count];
    const button = menubarButtonRefs.current.get(next.label);
    if (!button) {
      return;
    }
    pendingMenuFocusRef.current = "first";
    openMenuFromButton(next.label, button);
  };

  const handleMenubarButtonKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    label: string,
  ) => {
    const openAndFocus = (target: "first" | "last") => {
      event.preventDefault();
      if (activeMenuLabel === label) {
        // Already open: the popover exists, move focus straight into it.
        const items = menuPopoverItems();
        (target === "first" ? items[0] : items[items.length - 1])?.focus();
        return;
      }
      pendingMenuFocusRef.current = target;
      openMenuFromButton(label, event.currentTarget);
    };
    switch (event.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        openAndFocus("first");
        break;
      case "ArrowUp":
        openAndFocus("last");
        break;
      case "ArrowRight":
        event.preventDefault();
        focusMenubarButtonAt(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusMenubarButtonAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusMenubarButtonAt(0);
        break;
      case "End":
        event.preventDefault();
        focusMenubarButtonAt(menuBarSections.length - 1);
        break;
      default:
        break;
    }
  };

  const handleMenuPopoverKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const items = menuPopoverItems();
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const focusItemAt = (index: number) => {
      items[((index % items.length) + items.length) % items.length].focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItemAt(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItemAt(currentIndex < 0 ? -1 : currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItemAt(0);
        break;
      case "End":
        event.preventDefault();
        focusItemAt(items.length - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        switchToAdjacentMenu(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        switchToAdjacentMenu(-1);
        break;
      case "Tab":
        closeMenuBarMenu();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!activeMenuLabel) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      const trigger = menubarButtonRefs.current.get(activeMenuLabel);
      closeMenuBarMenu();
      onCloseWorkspaceMenu();
      trigger?.focus();
    };
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeMenuBarMenu();
        return;
      }
      // The dropdown is portaled outside the menubar, so also ignore clicks
      // landing inside it.
      if (
        menubarRef.current?.contains(target) ||
        menuPopoverRef.current?.contains(target)
      ) {
        return;
      }
      closeMenuBarMenu();
    };
    window.addEventListener("pointerdown", closeOnOutsidePointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeMenuLabel, onCloseWorkspaceMenu]);

  const commandById = new Map(
    commandCatalog.map((command) => [command.id, command]),
  );
  const shortcutFor = (commandId: string) => {
    const shortcut = keymap[commandId];
    return shortcut ? formatKeySequence(shortcut) : null;
  };
  const titleFor = (command: CommandMeta) => {
    switch (command.id) {
      case "view.sidebar.toggle":
        return leftSidebarOpen
          ? t("shell.hideLeftSidebar")
          : t("shell.showLeftSidebar");
      case "view.completion.toggle":
        return completionOpen
          ? t("shell.hideCompletion")
          : t("shell.showCompletion");
      case "view.history.toggle":
        return historyOpen ? t("shell.hideHistory") : t("shell.showHistory");
      case "view.plan.toggle":
        return planOpen ? t("shell.hidePlan") : t("shell.showPlan");
      case "theme.toggle":
        return themeKind === "dark"
          ? t("shell.lightTheme")
          : t("shell.darkTheme");
      case "about.open":
        return t("commands.about.open.title");
      default:
        return command.title;
    }
  };
  const runMenuCommand = (commandId: string) => {
    closeMenuBarMenu();
    onCloseWorkspaceMenu();
    onRunCommand(commandId);
  };
  const renderMenuButtons = (section: AppMenuSection) =>
    section.items.map((item) => {
      const command = commandById.get(item.commandId);
      if (!command) {
        return null;
      }
      const shortcut = shortcutFor(command.id);
      return (
        <button
          type="button"
          role="menuitem"
          key={command.id}
          onClick={() => runMenuCommand(command.id)}
        >
          <span>{titleFor(command)}</span>
          {shortcut ? <kbd>{shortcut}</kbd> : null}
        </button>
      );
    });

  return (
    <>
      <nav
        className="menubar"
        role="menubar"
        aria-label={t("shell.applicationMenu")}
        ref={menubarRef}
      >
        {menuBarSections.map((section, index) => (
          <div className="menubar-item" role="none" key={section.label}>
            <button
              type="button"
              role="menuitem"
              ref={(node) => {
                if (node) {
                  menubarButtonRefs.current.set(section.label, node);
                } else {
                  menubarButtonRefs.current.delete(section.label);
                }
              }}
              tabIndex={
                section.label ===
                (menubarFocusLabel ?? menuBarSections[0]?.label)
                  ? 0
                  : -1
              }
              aria-haspopup="menu"
              aria-expanded={activeMenuLabel === section.label}
              onFocus={() => setMenubarFocusLabel(section.label)}
              onKeyDown={(event) =>
                handleMenubarButtonKeyDown(event, index, section.label)
              }
              onClick={(event) => {
                // A hover onto this button already switched the open menu here;
                // the click that follows must not close it.
                if (hoverSwitchedLabelRef.current === section.label) {
                  hoverSwitchedLabelRef.current = null;
                  return;
                }
                if (activeMenuLabel === section.label) {
                  closeMenuBarMenu();
                } else {
                  openMenuFromButton(section.label, event.currentTarget);
                }
              }}
              onMouseEnter={(event) => {
                if (activeMenuLabel && activeMenuLabel !== section.label) {
                  hoverSwitchedLabelRef.current = section.label;
                  openMenuFromButton(section.label, event.currentTarget);
                }
              }}
            >
              {section.label}
            </button>
          </div>
        ))}
      </nav>

      {activeMenuLabel && menuAnchor
        ? createPortal(
            <div
              ref={menubarMenu.ref}
              className="app-menu-popover menubar-popover"
              role="menu"
              aria-label={activeMenuLabel}
              style={menubarMenu.style}
              onKeyDown={handleMenuPopoverKeyDown}
            >
              {menuBarSections
                .filter((section) => section.label === activeMenuLabel)
                .map((section) => (
                  <div key={section.label}>
                    <div
                      className="app-menu-section"
                      role="group"
                      aria-label={section.label}
                    >
                      {renderMenuButtons(section)}
                    </div>
                  </div>
                ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
});
