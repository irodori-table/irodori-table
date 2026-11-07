import { createTranslator, type Locale, type TranslationKey } from "@/i18n";
import type { CommandMeta } from "@/core/keybindings";
import type { SettingsTab } from "./SettingsDialog";

type SettingDefinition = {
  id: string;
  section: SettingsTab;
  title: TranslationKey;
  description?: TranslationKey;
};

export const searchableSettings: readonly SettingDefinition[] = [
  ...(
    [
      "updateCheckOnStartup",
      "language",
      "uiZoom",
      "editorMode",
      "editorBackground",
      "sidebarLabels",
      "animations",
      "autoCommit",
      "formatter",
      "linter",
      "resultOffload",
      "residentRows",
      "queryHistory",
      "historyRows",
      "sidebar",
      "resetLayout",
    ] as const
  ).map((id): SettingDefinition => ({
    id: `general.${id}`,
    section: "general",
    title: `settings.general.${id}.title`,
    description: `settings.general.${id}.description`,
  })),
  ...(["defaultThemes", "savedThemes", "importThemes"] as const).map(
    (id): SettingDefinition => ({
      id: `theme.${id}`,
      section: "theme",
      title: `settings.theme.${id}.title`,
      description: `settings.theme.${id}.description`,
    }),
  ),
  {
    id: "theme.colorMode",
    section: "theme",
    title: "settings.theme.colorMode.title",
    description: "settings.theme.colorMode.builtinDescription",
  },
  {
    id: "theme.activeTheme",
    section: "theme",
    title: "settings.theme.activeTheme.title",
  },
  {
    id: "security.passkey.status",
    section: "security",
    title: "settings.security.passkey.status.title",
  },
  {
    id: "security.passkey.lock",
    section: "security",
    title: "settings.security.passkey.lock.title",
    description: "settings.security.passkey.lock.description",
  },
  {
    id: "security.passkey.credential",
    section: "security",
    title: "settings.security.passkey.credential.title",
  },
  {
    id: "keymap",
    section: "keymap",
    title: "settings.nav.keymap",
    description: "settings.keymap.hint",
  },
  {
    id: "snippets",
    section: "snippets",
    title: "settings.snippets.title",
    description: "settings.snippets.description",
  },
  {
    id: "extensions",
    section: "extensions",
    title: "settings.nav.extensions",
    description: "settings.extensions.search",
  },
  {
    id: "jobs",
    section: "jobs",
    title: "settings.jobs.title",
    description: "settings.jobs.description",
  },
  {
    id: "json",
    section: "json",
    title: "settings.json.title",
    description: "settings.json.description",
  },
];

export type SettingsSearchResult = {
  id: string;
  section: SettingsTab;
  sectionLabel: string;
  title: string;
  description: string;
};

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

export function searchSettings(
  query: string,
  locale: Locale,
  commands: readonly CommandMeta[] = [],
): SettingsSearchResult[] {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const { t } = createTranslator(locale);
  const { t: alternate } = createTranslator(locale === "en" ? "ja" : "en");
  const matches = (text: string) =>
    tokens.every((token) => normalize(text).includes(token));
  const results = searchableSettings.flatMap((entry) => {
    const sectionKey = `settings.nav.${entry.section}` as const;
    const title = t(entry.title);
    const description = entry.description ? t(entry.description) : "";
    const text = [
      entry.id,
      title,
      description,
      t(sectionKey),
      alternate(entry.title),
      alternate(sectionKey),
      entry.description ? alternate(entry.description) : "",
    ].join(" ");
    return matches(text)
      ? [
          {
            id: entry.id,
            section: entry.section,
            sectionLabel: t(sectionKey),
            title,
            description,
          },
        ]
      : [];
  });
  for (const command of commands) {
    if (
      matches(
        `${command.id} ${command.title} ${t("settings.nav.keymap")} ${alternate("settings.nav.keymap")}`,
      )
    ) {
      results.push({
        id: `keymap.${command.id}`,
        section: "keymap",
        sectionLabel: t("settings.nav.keymap"),
        title: command.title,
        description: t("settings.keymap.rebindLabel", { title: command.title }),
      });
    }
  }
  return results;
}
