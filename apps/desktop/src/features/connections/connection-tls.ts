import type { ConnectionProfile, DbEngine } from "@/generated/irodori-api";
import { isRecord } from "@/core";
import type {
  ConnectionTls,
  ConnectionTlsMode,
} from "@/lib/workspace-connection";

/**
 * TLS modes for the built-in Postgres/MySQL wires. The values match the
 * foundation crates' `TlsMode` serde names so the draft can be sent verbatim.
 */
export const connectionTlsModes: ConnectionTlsMode[] = [
  "default",
  "disable",
  "prefer",
  "require",
  "verifyCa",
  "verifyFull",
  "clientCertificate",
];

export const legacyTlsOptionKeys = [
  "sslMode",
  "sslRootCert",
  "sslCert",
  "sslKey",
] as const;

const legacyTlsMode = (value: string): ConnectionTlsMode | null => {
  switch (value.trim().toLowerCase().replace(/_/g, "-")) {
    case "disable":
    case "disabled":
      return "disable";
    case "allow":
      return "prefer";
    case "prefer":
    case "preferred":
      return "prefer";
    case "require":
    case "required":
      return "require";
    case "verify-ca":
      return "verifyCa";
    case "verify-full":
    case "verify-identity":
      return "verifyFull";
    default:
      return null;
  }
};

export function connectionTlsMode(value: unknown): ConnectionTlsMode | null {
  return typeof value === "string" &&
    connectionTlsModes.includes(value as ConnectionTlsMode)
    ? (value as ConnectionTlsMode)
    : null;
}

const textValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function tlsHasCerts(tls: ConnectionTls) {
  return Boolean(tls.rootCert || tls.clientCert || tls.clientKey);
}

/**
 * Read a persisted typed TLS section. A default mode with no certificate is
 * treated as absent so old profiles keep comparing pristine.
 */
export function connectionTlsFromJson(
  value: unknown,
): ConnectionTls | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const tls: ConnectionTls = {
    mode: connectionTlsMode(value.mode) ?? "default",
    rootCert: textValue(value.rootCert),
    clientCert: textValue(value.clientCert),
    clientKey: textValue(value.clientKey),
  };
  return tls.mode === "default" && !tlsHasCerts(tls) ? undefined : tls;
}

/**
 * Move profiles saved before the typed surface from `options` onto `tls`.
 * `allow` becomes `prefer` because MySQL never had a distinct `allow` and
 * Postgres `allow` also means "try TLS, fall back".
 */
export function migrateConnectionTls(
  options: Record<string, string> | undefined,
  tls: unknown,
): {
  options: Record<string, string> | undefined;
  tls: ConnectionTls | undefined;
} {
  const typed = connectionTlsFromJson(tls);
  const legacy = legacyTlsFromOptions(options);
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    if (
      !legacyTlsOptionKeys.includes(key as (typeof legacyTlsOptionKeys)[number])
    ) {
      cleaned[key] = value;
    }
  }
  return {
    options: Object.keys(cleaned).length > 0 ? cleaned : undefined,
    tls: typed ?? legacy,
  };
}

function legacyTlsFromOptions(
  options: Record<string, string> | undefined,
): ConnectionTls | undefined {
  if (!options) {
    return undefined;
  }
  const rootCert = textValue(options.sslRootCert);
  const clientCert = textValue(options.sslCert);
  const clientKey = textValue(options.sslKey);
  const mode = legacyTlsMode(textValue(options.sslMode));
  if (!mode && !rootCert && !clientCert && !clientKey) {
    return undefined;
  }
  return {
    mode: mode ?? "require",
    rootCert,
    clientCert,
    clientKey,
  };
}

/** A validation message, or null when the TLS section is usable. */
export function validateConnectionTls(
  tls: ConnectionTls | undefined,
): string | null {
  if (!tls) {
    return null;
  }
  const hasCert = Boolean(tls.clientCert);
  const hasKey = Boolean(tls.clientKey);
  if (hasCert !== hasKey) {
    return "TLS client certificate and key must be set together";
  }
  if (tls.mode === "clientCertificate" && !hasCert) {
    return "client-certificate TLS mode requires a client certificate and key";
  }
  return null;
}

/**
 * Build the typed TLS profile section. Certificates are file paths carried in
 * `SecretRef.handle`, which is what the built-in sqlx wires read; a connector
 * with a keychain slot resolves them before connecting.
 */
export function tlsConfigFromDraft(
  tls: ConnectionTls | undefined,
): ConnectionProfile<DbEngine>["tls"] | undefined {
  if (!tls || (tls.mode === "default" && !tlsHasCerts(tls))) {
    return undefined;
  }
  const ref = (path: string) => ({ handle: path.trim() });
  return {
    mode: tls.mode,
    ...(tls.rootCert.trim() ? { rootCert: ref(tls.rootCert) } : {}),
    ...(tls.clientCert.trim() ? { clientCert: ref(tls.clientCert) } : {}),
    ...(tls.clientKey.trim() ? { clientKey: ref(tls.clientKey) } : {}),
  };
}
