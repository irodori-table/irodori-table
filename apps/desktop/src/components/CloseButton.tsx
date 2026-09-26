import { X } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";

type CloseButtonProps = {
  onClose: () => void;
  /** Accessible name and tooltip; defaults to the shared "Close". */
  label?: string;
  /** Extra classes for a panel that styles its own close affordance. */
  className?: string;
  size?: number;
};

/**
 * One close affordance for panel and dialog headers. Every panel used to
 * hand-roll the same `<button><X/></button>` with its own icon size (9–14px)
 * and label key, so the glyph, hit target, and wording drifted panel to panel.
 */
export function CloseButton({
  onClose,
  label,
  className,
  size = 14,
}: CloseButtonProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const text = label ?? t("common.close");
  return (
    <button
      type="button"
      className={className}
      title={text}
      aria-label={text}
      onClick={onClose}
    >
      <X size={size} />
    </button>
  );
}
