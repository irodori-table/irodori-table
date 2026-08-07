import type { HostFeatureId } from "./runtime-store";

/**
 * Commands that only exist while a declarative feature extension is installed
 * and enabled (#196, packaging model from #197).
 *
 * The panels these commands reach are compiled into the app but gated on the
 * extension, so a command left in the palette is a route straight past the
 * gate: the user runs it, `useSidebarViews` refuses the activation, and
 * nothing happens. Filtering the catalog is what keeps the palette honest
 * about what this build can do.
 *
 * This is a table rather than a check at the call site because the gate is
 * easy to forget: the next host feature that adds a command has to appear
 * here, and `hostFeatureCommandIds` is asserted against the command catalog so
 * a renamed or deleted command cannot leave a stale entry behind.
 */
const hostFeatureCommands: Readonly<Record<string, HostFeatureId>> = {
  "view.knowledge.toggle": "knowledge",
};

/**
 * The host feature a command depends on, or null when the command is always
 * available.
 */
export function hostFeatureForCommand(commandId: string): HostFeatureId | null {
  return hostFeatureCommands[commandId] ?? null;
}

/** Command ids gated on a host feature. Exported for the catalog check. */
export function hostFeatureCommandIds(): readonly string[] {
  return Object.keys(hostFeatureCommands);
}

/**
 * Drop the commands whose host feature is not enabled, preserving order and
 * the caller's command type (the palette passes localized entries).
 */
export function commandsAvailableForHostFeatures<T extends { id: string }>(
  commands: readonly T[],
  enabledHostFeatures: readonly HostFeatureId[],
): T[] {
  return commands.filter((command) => {
    const feature = hostFeatureForCommand(command.id);
    return feature === null || enabledHostFeatures.includes(feature);
  });
}
