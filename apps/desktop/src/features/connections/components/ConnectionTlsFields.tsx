import type { Translator } from "@/i18n";
import type {
  ConnectionDraft,
  ConnectionTls,
  ConnectionTlsMode,
} from "@/lib/workspace-connection";
import { connectionTlsModes } from "../connection-tls";
import { engineTlsPlaceholders } from "../engine-connection-settings";

const emptyTls: ConnectionTls = {
  mode: "default",
  rootCert: "",
  clientCert: "",
  clientKey: "",
};

const modeLabelKey: Record<ConnectionTlsMode, Parameters<Translator["t"]>[0]> =
  {
    default: "connection.option.driverDefault",
    disable: "connection.tls.mode.disable",
    prefer: "connection.tls.mode.prefer",
    require: "connection.tls.mode.require",
    verifyCa: "connection.tls.mode.verifyCa",
    verifyFull: "connection.tls.mode.verifyFull",
    clientCertificate: "connection.tls.mode.clientCertificate",
  };

/**
 * The typed TLS surface for the built-in Postgres/MySQL wires. Values are file
 * paths (sqlx reads certificates from disk); the profile carries them as
 * `TlsConfig` instead of the generic options map.
 */
export function ConnectionTlsFields({
  draft,
  t,
  onUpdateDraft,
}: {
  draft: ConnectionDraft;
  t: Translator["t"];
  onUpdateDraft: (patch: Partial<ConnectionDraft>) => void;
}) {
  const tls = draft.tls ?? emptyTls;
  const update = (patch: Partial<ConnectionTls>) =>
    onUpdateDraft({ tls: { ...tls, ...patch } });

  return (
    <div className="connection-form-stack connector-options full-row">
      <span className="connector-options-label">
        {t("connection.tls.section")}
      </span>
      <div className="connection-form-grid">
        <label>
          <span>{t("connection.field.sslMode")}</span>
          <select
            value={tls.mode}
            onChange={(event) =>
              update({ mode: event.currentTarget.value as ConnectionTlsMode })
            }
          >
            {connectionTlsModes.map((mode) => (
              <option key={mode} value={mode}>
                {t(modeLabelKey[mode])}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("connection.field.sslRootCert")}</span>
          <input
            value={tls.rootCert}
            placeholder={engineTlsPlaceholders.rootCert}
            onChange={(event) =>
              update({ rootCert: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>{t("connection.field.sslCert")}</span>
          <input
            value={tls.clientCert}
            placeholder={engineTlsPlaceholders.clientCert}
            onChange={(event) =>
              update({ clientCert: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>{t("connection.field.sslKey")}</span>
          <input
            value={tls.clientKey}
            placeholder={engineTlsPlaceholders.clientKey}
            onChange={(event) =>
              update({ clientKey: event.currentTarget.value })
            }
          />
        </label>
      </div>
    </div>
  );
}
