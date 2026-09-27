import {
  securityDeleteSecret,
  securityStoreSecret,
  type ConnectionProfile,
  type DbEngine,
  type SecretRef,
} from "@/generated/irodori-api";
import type { ConnectionDraft } from "@/lib/workspace-connection";

/**
 * The profile option that carries the keychain handle for a remembered
 * password. It is a handle, not the secret, so it is safe to persist with the
 * profile; the value never leaves the OS keychain.
 */
export const PASSWORD_SECRET_OPTION = "passwordSecret";

export type CredentialIo = {
  storeSecret: (
    connectionId: string,
    purpose: "password",
    value: string,
  ) => Promise<SecretRef>;
  deleteSecret: (secret: SecretRef) => Promise<void>;
};

export const defaultCredentialIo: CredentialIo = {
  storeSecret: securityStoreSecret,
  deleteSecret: securityDeleteSecret,
};

function readStoredRef(
  options: Record<string, string> | undefined,
): SecretRef | null {
  const raw = options?.[PASSWORD_SECRET_OPTION];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SecretRef;
    return typeof parsed?.handle === "string" && parsed.handle.length > 0
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Decide what happens to the connection password for one connect attempt.
 *
 * Remembering is the default: the typed password is written to the OS keychain
 * and its handle travels in the profile's options, so a later launch connects
 * with an empty field (the backend resolves the handle). Session-only deletes
 * any stored copy and leaves the password out of the profile.
 *
 * `store: false` (the Test button) only forwards an already-remembered handle;
 * it never writes a new secret, so a test attempt cannot leave one behind.
 *
 * Returns the profile to connect with, and the draft options to persist so the
 * handle survives a restart.
 */
export async function prepareStoredPassword(
  draft: ConnectionDraft,
  profile: ConnectionProfile<DbEngine>,
  io: CredentialIo = defaultCredentialIo,
  store = true,
): Promise<{
  profile: ConnectionProfile<DbEngine>;
  options: Record<string, string> | undefined;
}> {
  const options: Record<string, string> = { ...profile.options };
  const persisted: Record<string, string> = { ...draft.options };
  const stored = readStoredRef(persisted);

  if (!store) {
    if (stored) {
      options[PASSWORD_SECRET_OPTION] = JSON.stringify(stored);
    }
    return { profile: { ...profile, options }, options: persisted };
  }

  if (draft.rememberPassword === false) {
    if (stored) {
      // Best effort: a keychain that refuses the delete must not fail a
      // connection the user explicitly asked to be session-only.
      await io.deleteSecret(stored).catch(() => {});
    }
    delete options[PASSWORD_SECRET_OPTION];
    delete persisted[PASSWORD_SECRET_OPTION];
    return { profile: { ...profile, options }, options: persisted };
  }

  const ref = draft.password
    ? await io.storeSecret(draft.id.trim(), "password", draft.password)
    : stored;
  if (ref) {
    const handle = JSON.stringify(ref);
    options[PASSWORD_SECRET_OPTION] = handle;
    persisted[PASSWORD_SECRET_OPTION] = handle;
  }

  return { profile: { ...profile, options }, options: persisted };
}
