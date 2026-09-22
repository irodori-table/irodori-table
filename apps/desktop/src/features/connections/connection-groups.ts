import type { TranslationKey } from "@/i18n";
import type { ConnectionDraft } from "./connection-profiles";

export type ConnectionProfileGroup = {
  id: string;
  labelKey: TranslationKey;
  profiles: ConnectionDraft[];
};

const environmentOrder = ["prod", "stg", "dev", "local", "other"] as const;
const environmentLabelKeys: Record<
  (typeof environmentOrder)[number],
  TranslationKey
> = {
  prod: "connection.group.prod",
  stg: "connection.group.stg",
  dev: "connection.group.dev",
  local: "connection.group.local",
  other: "connection.group.other",
};

function connectionSearchText(profile: ConnectionDraft) {
  return [profile.id, profile.name, profile.host, profile.database, profile.url]
    .join(" ")
    .toLowerCase();
}

/** The environment bucket a profile is listed under, guessed from its text. */
export function connectionEnvironment(profile: ConnectionDraft) {
  const text = connectionSearchText(profile);
  if (/\b(prod|prd|production)\b/.test(text)) {
    return "prod";
  }
  if (/\b(stg|stage|staging)\b/.test(text)) {
    return "stg";
  }
  if (/\b(dev|develop|development|test|qa)\b/.test(text)) {
    return "dev";
  }
  if (/\b(local|localhost|127\.0\.0\.1|memory)\b/.test(text)) {
    return "local";
  }
  return "other";
}

/** Profiles grouped by environment, in the picker's fixed display order. */
export function groupConnectionProfiles(
  profiles: ConnectionDraft[],
): ConnectionProfileGroup[] {
  const byEnvironment = new Map<string, ConnectionDraft[]>();
  for (const profile of profiles) {
    const key = connectionEnvironment(profile);
    byEnvironment.set(key, [...(byEnvironment.get(key) ?? []), profile]);
  }
  return environmentOrder
    .filter((key) => byEnvironment.has(key))
    .map((key) => ({
      id: key,
      labelKey: environmentLabelKeys[key],
      profiles: byEnvironment.get(key) ?? [],
    }));
}
