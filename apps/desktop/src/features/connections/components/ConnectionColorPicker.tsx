import { Check, ChevronRight, Plus } from "lucide-react";
import type { Translator } from "@/i18n";
import {
  connectionCustomColorOptions,
  connectionColorOptions,
  normalizeConnectionColor,
} from "../connection-profiles";

type ConnectionColorPickerProps = {
  color: string;
  normalizedColor: string;
  t: Translator["t"];
  onChange: (color: string) => void;
  onNormalize: () => void;
};

function connectionColorForeground(color: string) {
  const normalized = normalizeConnectionColor(color);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#1c1c1c" : "#ffffff";
}

export function ConnectionColorPicker({
  color,
  normalizedColor,
  t,
  onChange,
  onNormalize,
}: ConnectionColorPickerProps) {
  return (
    <div className="connection-color-options">
      <div className="connection-color-bar">
        <div
          className="connection-color-grid"
          role="group"
          aria-label={t("connection.color.label")}
        >
          {connectionColorOptions.map((option) => (
            <ConnectionColorSwatch
              key={option}
              color={option}
              selected={normalizedColor === option}
              className="connection-color-swatch"
              t={t}
              onSelect={onChange}
            />
          ))}
          <label
            className="connection-color-custom"
            title={t("connection.color.pickCustom")}
          >
            <span
              className="connection-color-custom-chip"
              style={{
                background: normalizedColor,
                color: connectionColorForeground(normalizedColor),
              }}
              aria-hidden="true"
            >
              <Plus size={12} strokeWidth={2.5} />
            </span>
            <input
              type="color"
              value={normalizedColor}
              onChange={(event) => onChange(event.currentTarget.value)}
              aria-label={t("connection.color.useCustom")}
            />
          </label>
        </div>
        <input
          className="connection-color-hex"
          value={color}
          spellCheck={false}
          aria-label={t("connection.color.hex")}
          onBlur={onNormalize}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
      <details className="connection-color-more">
        <summary>
          <ChevronRight size={13} />
          <span>{t("connection.color.more")}</span>
        </summary>
        <div
          className="connection-color-palette"
          role="group"
          aria-label={t("connection.color.extendedPalette")}
        >
          {connectionCustomColorOptions.map((option) => (
            <ConnectionColorSwatch
              key={option}
              color={option}
              selected={normalizedColor === option}
              className="connection-color-chip"
              t={t}
              onSelect={onChange}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function ConnectionColorSwatch({
  color,
  selected,
  className,
  t,
  onSelect,
}: {
  color: string;
  selected: boolean;
  className: string;
  t: Translator["t"];
  onSelect: (color: string) => void;
}) {
  return (
    <button
      type="button"
      className={selected ? `${className} active` : className}
      style={{
        background: color,
        color: connectionColorForeground(color),
      }}
      aria-label={t("connection.color.use", { color })}
      aria-pressed={selected}
      onClick={() => onSelect(color)}
    >
      {selected ? <Check size={12} strokeWidth={3} /> : null}
    </button>
  );
}
