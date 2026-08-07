import {
  useEffect,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";
import { ChevronDown, Play } from "lucide-react";
import { createPortal } from "react-dom";
import {
  usePopoverDismiss,
  usePopoverPosition,
  type PopoverRect,
} from "@/components/popover";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type Translator } from "@/i18n";

/** Gap between the control's top edge and the menu opening above it. */
const menuGap = 6;

export type RunControlProps = {
  running: boolean;
  runControlRef: RefObject<HTMLDivElement | null>;
  runMenuOpen: boolean;
  setRunMenuOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  runPrimaryLabel: string;
  runShortcutLabel: string;
  runCurrentShortcutLabel: string;
  runFromStartShortcutLabel: string;
  runAllShortcutLabel: string;
  hasSelectedEditorSql: boolean;
  runQuery: () => Promise<void>;
  runSelectionQuery: () => Promise<void>;
  runCurrentQuery: () => Promise<void>;
  runFromStartQuery: () => Promise<void>;
  runAllQuery: () => Promise<void>;
};

export function RunControl({
  running,
  runControlRef,
  runMenuOpen,
  setRunMenuOpen,
  runPrimaryLabel,
  runShortcutLabel,
  runCurrentShortcutLabel,
  runFromStartShortcutLabel,
  runAllShortcutLabel,
  hasSelectedEditorSql,
  runQuery,
  runSelectionQuery,
  runCurrentQuery,
  runFromStartQuery,
  runAllQuery,
}: RunControlProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  // The menu is portaled to <body> because the run control sits inside
  // .workbench-dock-panel.editor, which is overflow:hidden. Rendered in place
  // the menu opened correctly — aria-expanded went true, opacity 1, z-index 25 —
  // but its box started 3px below the panel's bottom edge, so the panel clipped
  // every pixel of it and the button looked dead. Anchor coordinates have to be
  // measured, since a portaled node no longer inherits the control's position.
  const [anchorRect, setAnchorRect] = useState<PopoverRect | null>(null);
  useEffect(() => {
    if (!runMenuOpen) {
      setAnchorRect(null);
      return;
    }
    const measure = () => {
      const node = runControlRef.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        setAnchorRect({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [runControlRef, runMenuOpen]);

  // Above the control, right edges aligned, clamped against the menu's measured
  // box (#168). The old code positioned a zero-size `.run-menu-portal` wrapper
  // with `bottom`/`right` and let stylesheet rules place the real menu relative
  // to it, so the box the clamp reserved was not the box the user saw.
  const menu = usePopoverPosition<HTMLDivElement>(
    runMenuOpen && anchorRect
      ? {
          at: "element",
          rect: anchorRect,
          side: "above",
          align: "end",
          gap: menuGap,
        }
      : null,
  );
  // The control counts as inside: a press on the toggle must not dismiss here
  // and then be re-opened by the button's own click.
  usePopoverDismiss(
    [menu.ref, runControlRef],
    () => setRunMenuOpen(false),
    runMenuOpen,
  );

  return (
    <div className="editor-primary-actions">
      <div className="run-control editor-floating-run" ref={runControlRef}>
        <button
          className="primary-action run-main-button"
          type="button"
          title={
            runShortcutLabel
              ? `${runPrimaryLabel} (${runShortcutLabel})`
              : runPrimaryLabel
          }
          disabled={running}
          onClick={() => void runQuery()}
        >
          <Play size={15} fill="currentColor" />
          <span>{runPrimaryLabel}</span>
        </button>
        <button
          className="primary-action run-menu-toggle"
          type="button"
          title={t("run.options")}
          aria-label={t("run.options")}
          aria-haspopup="menu"
          aria-expanded={runMenuOpen}
          disabled={running}
          onClick={() => setRunMenuOpen((open) => !open)}
        >
          <ChevronDown size={14} />
        </button>
        {runMenuOpen && anchorRect
          ? createPortal(
              <RunOptionsMenu
                menuRef={menu.ref}
                style={menu.style}
                t={t}
                runPrimaryLabel={runPrimaryLabel}
                runShortcutLabel={runShortcutLabel}
                runCurrentShortcutLabel={runCurrentShortcutLabel}
                runFromStartShortcutLabel={runFromStartShortcutLabel}
                runAllShortcutLabel={runAllShortcutLabel}
                hasSelectedEditorSql={hasSelectedEditorSql}
                runQuery={runQuery}
                runSelectionQuery={runSelectionQuery}
                runCurrentQuery={runCurrentQuery}
                runFromStartQuery={runFromStartQuery}
                runAllQuery={runAllQuery}
              />,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

function RunOptionsMenu({
  menuRef,
  style,
  t,
  runPrimaryLabel,
  runShortcutLabel,
  runCurrentShortcutLabel,
  runFromStartShortcutLabel,
  runAllShortcutLabel,
  hasSelectedEditorSql,
  runQuery,
  runSelectionQuery,
  runCurrentQuery,
  runFromStartQuery,
  runAllQuery,
}: Omit<
  RunControlProps,
  "running" | "runControlRef" | "runMenuOpen" | "setRunMenuOpen"
> & {
  t: Translator["t"];
  menuRef: Ref<HTMLDivElement>;
  style: CSSProperties;
}) {
  return (
    <div
      className="app-menu-popover run-menu-popover"
      role="menu"
      ref={menuRef}
      style={style}
    >
      <button type="button" role="menuitem" onClick={() => void runQuery()}>
        <span>{runPrimaryLabel}</span>
        {runShortcutLabel ? <kbd>{runShortcutLabel}</kbd> : null}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!hasSelectedEditorSql}
        onClick={() => void runSelectionQuery()}
      >
        <span>{t("run.selection")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => void runCurrentQuery()}
      >
        <span>{t("run.current")}</span>
        {runCurrentShortcutLabel ? <kbd>{runCurrentShortcutLabel}</kbd> : null}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => void runFromStartQuery()}
      >
        <span>{t("run.fromTop")}</span>
        {runFromStartShortcutLabel ? (
          <kbd>{runFromStartShortcutLabel}</kbd>
        ) : null}
      </button>
      <button type="button" role="menuitem" onClick={() => void runAllQuery()}>
        <span>{t("run.all")}</span>
        {runAllShortcutLabel ? <kbd>{runAllShortcutLabel}</kbd> : null}
      </button>
    </div>
  );
}
