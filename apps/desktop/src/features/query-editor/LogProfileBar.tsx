import { Table2 } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type TranslationKey } from "@/i18n";
import { logProfileIds, type LogProfileId } from "./editor-log-profile";

export type LogProfileBarProps = {
  profileId: LogProfileId;
  hasContent: boolean;
  onProfileChange: (profileId: LogProfileId) => void;
  onCreateTable: () => void;
};

const profileLabelKeys = {
  auto: "editor.logProfile.auto",
  common: "editor.logProfile.common",
  jsonl: "editor.logProfile.jsonl",
} as const satisfies Record<LogProfileId, TranslationKey>;

/** Structured-table entry point for `.log` buffers (#177 tier 4). */
export function LogProfileBar({
  profileId,
  hasContent,
  onProfileChange,
  onCreateTable,
}: LogProfileBarProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);

  return (
    <div
      className="log-profile-bar"
      role="group"
      aria-label={t("editor.logProfile.label")}
    >
      <label className="log-profile-picker">
        <span>{t("editor.logProfile.profile")}</span>
        <select
          value={profileId}
          onChange={(event) =>
            onProfileChange(event.currentTarget.value as LogProfileId)
          }
        >
          {logProfileIds.map((id) => (
            <option key={id} value={id}>
              {t(profileLabelKeys[id])}
            </option>
          ))}
        </select>
      </label>
      <span className="log-profile-hint">{t("editor.logProfile.hint")}</span>
      <button
        className="text-button log-profile-create"
        type="button"
        disabled={!hasContent}
        title={t("editor.logProfile.createTable")}
        onClick={onCreateTable}
      >
        <Table2 size={13} aria-hidden="true" />
        <span>{t("editor.logProfile.createTable")}</span>
      </button>
    </div>
  );
}
