export {
  defaultConnectionColor,
  describeConnection,
  engineLabel,
  engineOptions,
  isPristineDraftProfile,
  memoryDefaults,
  newDraft,
  portableProfile,
  profileFromDraft,
  repairBuiltinSampleProfile,
  sanitizedProfile,
  settingsProfileFromJson,
  sqliteSampleProfile,
  sqliteSampleSeedSql,
  validateDraft,
  withStarterProfiles,
  withUniqueProfileIds,
  type ConnectionDraft,
  type WorkspaceConnection,
} from "./connection-profiles";
export { prepareConnectionRequest } from "./ssh-tunnel-request";
export { prepareStoredPassword } from "./connection-credentials";
export {
  connectionTlsModes,
  legacyTlsOptionKeys,
  migrateConnectionTls,
  tlsConfigFromDraft,
  validateConnectionTls,
} from "./connection-tls";
export type {
  ConnectionTls,
  ConnectionTlsMode,
} from "@/lib/workspace-connection";
export {
  exportConnectionProfiles,
  importConnectionProfiles,
  type ConnectionTransferFormat,
} from "./connection-transfer";
export {
  engineCorrectnessWarning,
  enginesWithCorrectnessWarnings,
} from "./engine-correctness-warnings";
export { ConnectionManagerDialog } from "./ConnectionManagerDialog";
export { useConnectionStore } from "./connection-store";
