import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  popoverSurfaceStyle,
  usePopoverPosition,
  type PopoverRect,
} from "@/components/popover";

const SHOW_DELAY_MS = 350;
const TARGET = "button[title], a[title]";

/**
 * Shows a control's `title` as the app's own tooltip.
 *
 * The webview on Linux does not reliably show native title tooltips, so an icon
 * button explained nothing on hover. `title` stays the single source of the
 * text. It is lifted off the element while hovered, so a platform that does show
 * native tooltips does not show both.
 */
export function HoverTooltips() {
  const [tip, setTip] = useState<{ text: string; rect: PopoverRect } | null>(
    null,
  );
  const { ref, style } = usePopoverPosition<HTMLDivElement>(
    tip ? { at: "element", rect: tip.rect, side: "below", align: "start" } : null,
  );

  useEffect(() => {
    let active: Element | null = null;
    let lifted: string | null = null;
    let timer: number | undefined;

    const release = () => {
      window.clearTimeout(timer);
      if (active && lifted !== null && !active.hasAttribute("title")) {
        active.setAttribute("title", lifted);
      }
      active = null;
      lifted = null;
      setTip(null);
    };

    const onMouseOver = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element && active?.contains(element)) {
        return;
      }
      release();
      const target = element?.closest(TARGET);
      const text = target?.getAttribute("title");
      if (!target || !text) {
        return;
      }
      active = target;
      lifted = text;
      target.removeAttribute("title");
      timer = window.setTimeout(() => {
        if (target.isConnected) {
          setTip({ text, rect: target.getBoundingClientRect() });
        }
      }, SHOW_DELAY_MS);
    };

    const onMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget === null) {
        release();
      }
    };

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("mousedown", release, true);
    document.addEventListener("keydown", release, true);
    document.addEventListener("scroll", release, true);
    window.addEventListener("blur", release);
    return () => {
      release();
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("mousedown", release, true);
      document.removeEventListener("keydown", release, true);
      document.removeEventListener("scroll", release, true);
      window.removeEventListener("blur", release);
    };
  }, []);

  if (!tip) {
    return null;
  }
  return createPortal(
    <div
      ref={ref}
      className="hover-tooltip"
      role="tooltip"
      style={{ ...popoverSurfaceStyle, ...style }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
