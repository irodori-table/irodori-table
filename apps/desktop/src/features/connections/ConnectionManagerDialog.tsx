import { useEffect, useState, type FormEventHandler } from "react";
import {
  AlertTriangle,
  Database,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import {
  dbEngineBuildSupport,
  type DbEngine,
  type EngineBuildSupport,
} from "@/generated/irodori-api";
import { DialogShell } from "@/components/DialogShell";
import { ErrorDetails } from "@/components/ErrorDetails";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type { ConnectorConnectionModel } from "@/features/extensions/connection-model";
import { ConnectionColorPicker } from "./components/ConnectionColorPicker";
import {
  ConnectionEndpointFields,
  type ConnectionTransportMode,
} from "./components/ConnectionEndpointFields";
import { ConnectionOptionFields } from "./components/ConnectionOptionFields";
import { ConnectionProfilePicker } from "./components/ConnectionProfilePicker";
import { ConnectorDeclaredSections } from "./components/ConnectorDeclaredSections";
import {
  connectorChoiceLabel,
  resolveConnectorFormModel,
} from "./connector-form-model";
import {
  engineConnectionSettings,
  engineLabel,
  engineOptionFields,
  engineOptions,
  normalizeConnectionColor,
  supportsSocketTransport,
  type ConnectionDraft,
} from "./connection-profiles";
import { sshTunnelAvailable, sshTunnelSettings } from "./connection-ssh";
import type { ConnectionTransferFormat } from "./connection-transfer";
import {
  buildSupportByEngine,
  featureMissingMessage,
  isFeatureMissing,
  socketPathLabelKey,
} from "./engine-build-support";
import { SshTunnelFields } from "./SshTunnelFields";
import { useConnectionSelection } from "./use-connection-selection";

const noInstalledConnectorEngines: ReadonlySet<DbEngine> = new Set();

export function ConnectionManagerDialog({
  profiles,
  connectedIds,
  selectedProfileId,
  draft,
  search,
  error,
  testing,
  connecting,
  connectionModel = null,
  installedConnectorEngines = noInstalledConnectorEngines,
  onClose,
  onSearchChange,
  onAddProfile,
  onImportProfiles,
  onExportProfiles,
  onSelectProfile,
  onUpdateDraft,
  onDeleteProfiles,
  onSave,
  onTest,
  onConnect,
  onOpenSqliteSample,
}: {
  profiles: ConnectionDraft[];
  connectedIds: Set<string>;
  selectedProfileId: string;
  draft: ConnectionDraft;
  search: string;
  error: unknown | null;
  testing: boolean;
  connecting: boolean;
  connectionModel?: ConnectorConnectionModel | null;
  installedConnectorEngines?: ReadonlySet<DbEngine>;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onAddProfile: () => void;
  onImportProfiles: (file: File) => void;
  onExportProfiles: (format: ConnectionTransferFormat) => void;
  onSelectProfile: (profile: ConnectionDraft) => void;
  onUpdateDraft: (patch: Partial<ConnectionDraft>) => void;
  onDeleteProfiles: (ids: string[]) => void;
  onSave: () => void;
  onTest: () => void;
  onConnect: FormEventHandler<HTMLFormElement>;
  onOpenSqliteSample: () => void;
}) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const engineSettings = engineConnectionSettings(draft.engine, t);
  const form = resolveConnectorFormModel(
    connectionModel,
    draft,
    engineOptionFields(draft.engine),
  );
  const selection = useConnectionSelection({
    profiles,
    draft,
    t,
    onSelectProfile,
    onDeleteProfiles,
  });
  const [engineBuildSupport, setEngineBuildSupport] = useState(
    () => new Map<DbEngine, EngineBuildSupport>(),
  );
  const normalizedDraftColor = normalizeConnectionColor(draft.color);
  const socketSupported =
    !form.usesDeclaredEndpoint && supportsSocketTransport(draft.engine);
  const selectedEngineMessage = installedConnectorEngines.has(draft.engine)
    ? null
    : featureMissingMessage(
        draft.engine,
        engineBuildSupport.get(draft.engine),
        t,
      );
  const selectedEngineMissing = Boolean(selectedEngineMessage);
  const transportMode: ConnectionTransportMode =
    socketSupported && draft.connectionTransport === "socket"
      ? "socket"
      : "tcp";
  const sshAvailable = sshTunnelAvailable(draft, connectionModel);
  const sshTunnel = sshTunnelSettings(draft);
  const sshActive = sshAvailable && sshTunnel.enabled;
  const bothInputModes = form.supportsUrlInput && form.supportsFieldsInput;

  // A connector that accepts only one input shape decides the mode; the
  // toggle is hidden and the draft follows.
  useEffect(() => {
    if (!connectionModel || bothInputModes) {
      return;
    }
    const supportedMode = form.supportsFieldsInput ? "fields" : "url";
    if (draft.mode !== supportedMode) {
      onUpdateDraft({ mode: supportedMode });
    }
  }, [
    bothInputModes,
    connectionModel,
    draft.mode,
    form.supportsFieldsInput,
    onUpdateDraft,
  ]);

  useEffect(() => {
    let active = true;
    void dbEngineBuildSupport()
      .then((items) => {
        if (active) {
          setEngineBuildSupport(buildSupportByEngine(items));
        }
      })
      .catch(() => {
        if (active) {
          setEngineBuildSupport(new Map());
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleConnect: FormEventHandler<HTMLFormElement> = (event) => {
    if (selectedEngineMissing) {
      event.preventDefault();
      return;
    }
    onConnect(event);
  };

  const transportSummary = sshActive
    ? t("connection.ssh.summary", {
        host: sshTunnel.host.trim() || t("connection.ssh.host"),
      })
    : draft.mode === "fields" && transportMode === "socket"
      ? t(socketPathLabelKey(draft.engine))
      : connectionModel
        ? connectorChoiceLabel(
            connectionModel.transports[0] ??
              connectionModel.defaults.wire ??
              "direct",
          )
        : engineSettings.transportLabel;

  return (
    <DialogShell
      className="connection-dialog"
      overlayClassName="palette-overlay connection-overlay"
      label={t("connection.title")}
      onClose={onClose}
      autoFocus={false}
    >
      <ConnectionProfilePicker
        profiles={profiles}
        connectedIds={connectedIds}
        selectedProfileId={selectedProfileId}
        search={search}
        selection={selection}
        t={t}
        onSearchChange={onSearchChange}
        onAddProfile={onAddProfile}
        onImportProfiles={onImportProfiles}
        onExportProfiles={onExportProfiles}
        onSelectProfile={onSelectProfile}
        onOpenSqliteSample={onOpenSqliteSample}
      />
      <form className="connection-form" onSubmit={handleConnect}>
        <div className="dialog-header">
          <strong>
            {draft.name.trim() || t("connection.newConnectionName")}
          </strong>
          <span>{engineLabel(draft.engine)}</span>
          <button className="text-button" type="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <div className="dialog-body connection-form-body">
          <label className="full-row">
            <span>{t("connection.name")}</span>
            <input
              value={draft.name}
              placeholder={t("connection.namePlaceholder")}
              onChange={(event) =>
                onUpdateDraft({ name: event.currentTarget.value })
              }
            />
          </label>
          <div className="connection-color-row full-row">
            <span>{t("connection.colorTag")}</span>
            <ConnectionColorPicker
              color={draft.color}
              normalizedColor={normalizedDraftColor}
              t={t}
              onChange={(color) => onUpdateDraft({ color })}
              onNormalize={() =>
                onUpdateDraft({
                  color: normalizeConnectionColor(draft.color),
                })
              }
            />
          </div>
          <div className="connection-form-grid">
            <label className={bothInputModes ? undefined : "full-row"}>
              <span>{t("connection.engine")}</span>
              <select
                value={draft.engine}
                onChange={(event) =>
                  onUpdateDraft({
                    engine: event.currentTarget.value as DbEngine,
                  })
                }
              >
                {engineOptions.map((engine) => {
                  const missing =
                    !installedConnectorEngines.has(engine.value) &&
                    isFeatureMissing(engineBuildSupport.get(engine.value));
                  return (
                    <option
                      key={engine.value}
                      value={engine.value}
                      disabled={missing}
                    >
                      {engine.label}
                      {missing ? ` ${t("connection.notInBuild")}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            {selectedEngineMessage ? (
              <p className="inline-error connection-build-error full-row">
                <AlertTriangle size={13} />
                <span>{selectedEngineMessage}</span>
              </p>
            ) : null}
            {bothInputModes ? (
              <div
                className="mode-toggle form-toggle"
                role="group"
                aria-label={t("connection.inputMode")}
              >
                <button
                  className={draft.mode === "url" ? "active" : ""}
                  type="button"
                  onClick={() => onUpdateDraft({ mode: "url" })}
                >
                  URL
                </button>
                <button
                  className={draft.mode === "fields" ? "active" : ""}
                  type="button"
                  onClick={() => onUpdateDraft({ mode: "fields" })}
                >
                  {engineSettings.fieldsLabel}
                </button>
              </div>
            ) : null}
          </div>
          <ConnectionEndpointFields
            draft={draft}
            engineSettings={engineSettings}
            form={form}
            socketSupported={socketSupported}
            transportMode={transportMode}
            t={t}
            onUpdateDraft={onUpdateDraft}
          />
          <ConnectorDeclaredSections
            draft={draft}
            form={form}
            t={t}
            onUpdateDraft={onUpdateDraft}
          />
          <ConnectionOptionFields
            fields={form.visibleOptionFields}
            draft={draft}
            t={t}
            onUpdateDraft={onUpdateDraft}
          />
          {sshAvailable ? (
            <SshTunnelFields
              draft={draft}
              t={t}
              onUpdateDraft={onUpdateDraft}
            />
          ) : null}
          <label className="connection-readonly-toggle full-row">
            <input
              type="checkbox"
              checked={draft.readOnly}
              onChange={(event) =>
                onUpdateDraft({ readOnly: event.currentTarget.checked })
              }
            />
            <span>
              <LockKeyhole size={14} />
              <strong>{t("connection.readOnly")}</strong>
            </span>
          </label>
          <div className="connection-transport full-row">
            <ShieldCheck size={15} />
            <span>{t("connection.transport")}</span>
            <strong>{transportSummary}</strong>
          </div>
          {error ? (
            <ErrorDetails
              className="inline-error full-row error-callout"
              error={error}
              icon={<AlertTriangle size={13} />}
            />
          ) : null}
        </div>
        <div className="dialog-footer">
          <button
            className="text-button danger"
            type="button"
            disabled={!selection.deleteTargetExists}
            onClick={selection.requestDeleteSelected}
          >
            {t("common.delete")}
          </button>
          <button className="text-button" type="button" onClick={onSave}>
            {t("common.save")}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={testing || selectedEngineMissing}
            onClick={onTest}
          >
            {testing ? t("connection.testing") : t("connection.test")}
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={connecting || selectedEngineMissing}
          >
            <Database size={14} />
            {connecting ? t("connection.connecting") : t("connection.connect")}
          </button>
        </div>
      </form>
      {selection.confirmElement}
    </DialogShell>
  );
}
