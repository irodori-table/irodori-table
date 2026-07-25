import { useEffect, useState, type RefObject } from "react";
import { ChevronDown, Play } from "lucide-react";
import { createPortal } from "react-dom";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type Translator } from "@/i18n";

// The reserved box for the run menu: `min-width: 260px` from
// `.run-menu-popover`, and the tallest the option list gets with every entry
// shown. EditorTabStrip reserves the same way (#115).
const menuWidth = 260;
const menuHeight = 200;
const menuMargin = 8;
/** Gap between the control's top edge and the menu opening above it. */
const menuGap = 6;

/**
 * Place the menu above the control, anchored to its right edge, without letting
 * either inset push the box off-screen.
 *
 * The menu opens upward because the control is pinned to the bottom of the
 * editor pane. It anchors on `right` so it lines up with the control, which
 * means a *large* right inset pushes it off the LEFT edge — the mirror image of
 * the off-screen menu fixed in the tab strip (#115). Without the clamp a narrow
 * editor pane produced exactly that.
 */
function clampMenuToViewport(anchorRect: DOMRect) {
  const bottom = window.innerHeight - anchorRect.top + menuGap;
  const right = window.innerWidth - anchorRect.right;
  return {
    bottom: `${Math.round(
      Math.max(
        menuMargin,
        Math.min(bottom, window.innerHeight - menuHeight - menuMargin),
      ),
    )}px`,
    right: `${Math.round(
      Math.max(
        menuMargin,
        Math.min(right, window.innerWidth - menuWidth - menuMargin),
      ),
    )}px`,
  };
}

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
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!runMenuOpen) {
      setAnchorRect(null);
      return;
    }
    const measure = () => {
      const node = runControlRef.current;
      if (node) {
        setAnchorRect(node.getBoundingClientRect());
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

  useEffect(() => {
    if (!runMenuOpen) {
      return;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && runControlRef.current?.contains(target)) {
        return;
      }
      setRunMenuOpen(false);
    };
    const closeOnBlur = () => setRunMenuOpen(false);

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [runControlRef, runMenuOpen, setRunMenuOpen]);

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
              <div
                className="run-menu-portal"
                style={{
                  position: "fixed",
                  ...clampMenuToViewport(anchorRect),
                  zIndex: 60,
                }}
              >
                <RunOptionsMenu
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
                />
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

function RunOptionsMenu({
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
> & { t: Translator["t"] }) {
  return (
    <div className="app-menu-popover run-menu-popover" role="menu">
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
