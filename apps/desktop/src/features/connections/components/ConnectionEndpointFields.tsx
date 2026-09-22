import type { DbEngine } from "@/generated/irodori-api";
import type { Translator } from "@/i18n";
import { resolvedConnectorProfileValue } from "../connector-connection-values";
import type { ConnectorFormModel } from "../connector-form-model";
import type { ConnectionDraft } from "../connection-profiles";
import {
  socketPathLabelKey,
  socketPathPlaceholder,
} from "../engine-build-support";
import type { EngineConnectionSettings } from "../engine-connection-settings";

export type ConnectionTransportMode = "tcp" | "socket";

type ConnectionEndpointFieldsProps = {
  draft: ConnectionDraft;
  engineSettings: EngineConnectionSettings;
  form: ConnectorFormModel;
  socketSupported: boolean;
  transportMode: ConnectionTransportMode;
  t: Translator["t"];
  onUpdateDraft: (patch: Partial<ConnectionDraft>) => void;
};

/**
 * Where the database is: one URL, or host/port/user/password/database (and a
 * TCP/socket toggle for engines that listen on a local socket).
 *
 * A connector's declared endpoint and profile fields replace the built-in
 * labels and requiredness where they overlap; built-in user/password inputs
 * step aside entirely because a connector collects credentials through its
 * declared authentication methods instead.
 */
export function ConnectionEndpointFields({
  draft,
  engineSettings,
  form,
  socketSupported,
  transportMode,
  t,
  onUpdateDraft,
}: ConnectionEndpointFieldsProps) {
  const { connectionModel, usesDeclaredEndpoint } = form;
  const profileValue = (
    field: "url" | "host" | "port" | "database",
    fallback: string,
  ) =>
    connectionModel
      ? resolvedConnectorProfileValue(connectionModel, draft, field)
      : fallback;

  if (draft.mode === "url") {
    return (
      <label className="full-row">
        <span>{form.urlField?.label ?? engineSettings.urlLabel}</span>
        <input
          value={profileValue("url", draft.url)}
          placeholder={engineSettings.urlPlaceholder}
          required
          onChange={(event) =>
            onUpdateDraft({ url: event.currentTarget.value })
          }
        />
      </label>
    );
  }

  const showHost = usesDeclaredEndpoint
    ? Boolean(form.hostField)
    : engineSettings.showHost;
  const showPort = usesDeclaredEndpoint
    ? Boolean(form.portField)
    : engineSettings.showPort;
  const showDatabase = !usesDeclaredEndpoint || Boolean(form.databaseField);

  return (
    <div className="connection-form-stack full-row">
      {socketSupported ? (
        <div
          className="connection-transport-toggle form-toggle"
          role="group"
          aria-label={t("connection.transportMode")}
        >
          <button
            className={transportMode === "tcp" ? "active" : ""}
            type="button"
            onClick={() => onUpdateDraft({ connectionTransport: "tcp" })}
          >
            {t("connection.transportTcp")}
          </button>
          <button
            className={transportMode === "socket" ? "active" : ""}
            type="button"
            onClick={() => onUpdateDraft({ connectionTransport: "socket" })}
          >
            {t("connection.transportSocket")}
          </button>
        </div>
      ) : null}
      <div className="connection-form-grid">
        {transportMode === "socket" ? (
          <SocketPathField
            engine={draft.engine}
            value={draft.socketPath}
            t={t}
            onChange={(socketPath) => onUpdateDraft({ socketPath })}
          />
        ) : (
          <>
            {showHost ? (
              <label>
                <span>{form.hostField?.label ?? engineSettings.hostLabel}</span>
                <input
                  value={profileValue("host", draft.host)}
                  placeholder={engineSettings.hostPlaceholder}
                  required={form.hostField?.required ?? false}
                  onChange={(event) =>
                    onUpdateDraft({ host: event.currentTarget.value })
                  }
                />
              </label>
            ) : null}
            {showPort ? (
              <label>
                <span>{form.portField?.label ?? engineSettings.portLabel}</span>
                <input
                  inputMode="numeric"
                  value={profileValue("port", draft.port)}
                  required={form.portField?.required ?? false}
                  onChange={(event) =>
                    onUpdateDraft({ port: event.currentTarget.value })
                  }
                />
              </label>
            ) : null}
          </>
        )}
        {!connectionModel && engineSettings.showUser ? (
          <label>
            <span>{engineSettings.userLabel}</span>
            <input
              value={draft.user}
              placeholder={engineSettings.userPlaceholder}
              onChange={(event) =>
                onUpdateDraft({ user: event.currentTarget.value })
              }
            />
          </label>
        ) : null}
        {!connectionModel && engineSettings.showPassword ? (
          <label>
            <span>{engineSettings.passwordLabel}</span>
            <input
              type="password"
              value={draft.password}
              placeholder={engineSettings.passwordPlaceholder}
              onChange={(event) =>
                onUpdateDraft({ password: event.currentTarget.value })
              }
            />
          </label>
        ) : null}
        {showDatabase ? (
          <label className="full-row">
            <span>
              {form.databaseField?.label ?? engineSettings.databaseLabel}
            </span>
            <input
              value={profileValue("database", draft.database)}
              placeholder={engineSettings.databasePlaceholder}
              required={form.databaseField?.required ?? false}
              onChange={(event) =>
                onUpdateDraft({ database: event.currentTarget.value })
              }
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function SocketPathField({
  engine,
  value,
  t,
  onChange,
}: {
  engine: DbEngine;
  value: string;
  t: Translator["t"];
  onChange: (value: string) => void;
}) {
  return (
    <label className="full-row">
      <span>{t(socketPathLabelKey(engine))}</span>
      <input
        value={value}
        placeholder={socketPathPlaceholder(engine)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
