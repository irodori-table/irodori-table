import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Power,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  assertSupportedInstallKind,
  compareExtensionVersions,
  bundledPluginStoreCatalog,
  defaultPluginStoreCatalogUrl,
  fetchPluginStoreCatalog,
  isExtensionUpdatable,
  resolvePluginStoreInstallAsset,
  UnsupportedInstallKindError,
  type PluginStoreCatalog,
  type PluginStoreExtension,
} from "@/features/extensions/plugin-store";
import { useExtensionRuntimeStore } from "@/features/extensions/runtime-store";
import {
  extInstall,
  extList,
  extSetEnabled,
  extTarget,
  extUninstall,
  type InstalledExtension,
} from "@/generated/irodori-api";
import { openExternalUrl, type TranslateFn } from "./shared";
import { errorMessage } from "@/core";

function MarketplaceSection({
  title,
  empty,
  extensions,
  installedById,
  nativeTarget,
  operationId,
  showUnavailable,
  t,
  onInstall,
  onToggleUnavailable,
}: {
  title: string;
  empty: string;
  extensions: readonly PluginStoreExtension[];
  installedById: ReadonlyMap<string, InstalledExtension>;
  nativeTarget: string | null;
  operationId: string | null;
  showUnavailable: boolean;
  t: TranslateFn;
  onInstall: (extension: PluginStoreExtension) => void;
  onToggleUnavailable: () => void;
}) {
  // An entry with no release asset for this platform only dead-ends in a
  // disabled Install button, so it is hidden by default (#131). Installed
  // entries always stay visible: their state ("Installed") is still useful.
  // Without a runtime target (browser preview, e2e harness) nothing is
  // resolvable, so treat "no target" as "no filtering" instead of rendering
  // an empty marketplace.
  const isUnavailable = (extension: PluginStoreExtension) =>
    nativeTarget !== null &&
    !installedById.has(extension.id) &&
    !resolvePluginStoreInstallAsset(extension, nativeTarget);
  const hiddenCount = extensions.filter(isUnavailable).length;
  const visibleExtensions = showUnavailable
    ? extensions
    : extensions.filter((extension) => !isUnavailable(extension));

  return (
    <section className="extension-section">
      <div className="extension-section-header">
        <span>{title}</span>
        <span className="extension-section-tools">
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="text-button extension-hidden-toggle"
              onClick={onToggleUnavailable}
            >
              {showUnavailable
                ? t("settings.extensions.hideUnavailable")
                : t("settings.extensions.hiddenForPlatform", {
                    count: hiddenCount,
                  })}
            </button>
          ) : null}
          <small>{visibleExtensions.length}</small>
        </span>
      </div>
      {visibleExtensions.length === 0 ? (
        <div className="extension-empty">{empty}</div>
      ) : (
        <div className="extension-list">
          {visibleExtensions.map((extension) => {
            const installed = installedById.get(extension.id);
            const asset = nativeTarget
              ? resolvePluginStoreInstallAsset(extension, nativeTarget)
              : undefined;
            const updateAvailable = Boolean(
              installed &&
              compareExtensionVersions(extension.version, installed.version) >
                0,
            );
            const current = Boolean(installed && !updateAvailable);
            const busy = operationId === extension.id;
            const actionLabel = busy
              ? t("settings.extensions.working")
              : updateAvailable
                ? t("settings.extensions.update")
                : current
                  ? t("settings.extensions.installedAction")
                  : asset
                    ? t("settings.extensions.install")
                    : t("settings.extensions.unsupported");

            return (
              <article className="extension-item" key={extension.id}>
                <div className="extension-icon" aria-hidden="true">
                  {extension.name.slice(0, 1)}
                </div>
                <div className="extension-main">
                  <div className="extension-title-row">
                    <strong>{extension.name}</strong>
                    <span>{extension.version}</span>
                  </div>
                  <p>{extension.summary}</p>
                  <div className="extension-meta">
                    <span>{extension.publisher}</span>
                    <span>{extension.runtime}</span>
                    <span>{extension.engines.join(", ")}</span>
                    {installed ? (
                      <span>
                        {t("settings.extensions.currentVersion", {
                          version: installed.version,
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="extension-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title={t("settings.extensions.openRelease")}
                    aria-label={t("settings.extensions.openReleaseFor", {
                      name: extension.name,
                    })}
                    onClick={() =>
                      openExternalUrl(
                        extension.install?.url ?? extension.repository,
                      )
                    }
                  >
                    <ExternalLink size={15} />
                  </button>
                  <button
                    type="button"
                    className="text-button primary"
                    disabled={busy || current || !asset}
                    onClick={() => onInstall(extension)}
                  >
                    <Download size={14} />
                    {actionLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InstalledSection({
  installed,
  catalogById,
  nativeTarget,
  operationId,
  t,
  updatableCount,
  onInstall,
  onToggle,
  onUninstall,
  onUpdateAll,
}: {
  installed: readonly InstalledExtension[];
  catalogById: ReadonlyMap<string, PluginStoreExtension>;
  nativeTarget: string | null;
  operationId: string | null;
  t: TranslateFn;
  updatableCount: number;
  onInstall: (extension: PluginStoreExtension) => void;
  onToggle: (extension: InstalledExtension) => void;
  onUninstall: (extension: InstalledExtension) => void;
  onUpdateAll: () => void;
}) {
  // Any in-flight operation disables the batch: it walks the whole installed
  // list, so letting it start beside a single install would have the two
  // racing for the same extension directory.
  const batchBusy = operationId !== null;
  return (
    <section className="extension-section">
      <div className="extension-section-header">
        <span>{t("settings.extensions.installed")}</span>
        <small>{installed.length}</small>
        {updatableCount > 0 ? (
          <button
            type="button"
            className="text-button primary extension-update-all"
            disabled={batchBusy}
            onClick={onUpdateAll}
          >
            <Download size={14} />
            {t("settings.extensions.updateAll", { count: updatableCount })}
          </button>
        ) : null}
      </div>
      {installed.length === 0 ? (
        <div className="extension-empty">
          {t("settings.extensions.noInstalled")}
        </div>
      ) : (
        <div className="extension-list">
          {installed.map((extension) => {
            const catalog = catalogById.get(extension.id);
            const canUpdate = isExtensionUpdatable(
              catalog,
              extension.version,
              nativeTarget,
            );
            const busy = operationId === extension.id;
            return (
              <article className="extension-item" key={extension.id}>
                <div className="extension-icon" aria-hidden="true">
                  {extension.name.slice(0, 1)}
                </div>
                <div className="extension-main">
                  <div className="extension-title-row">
                    <strong>{extension.name}</strong>
                    <span>{extension.version}</span>
                  </div>
                  <p>
                    {extension.runtime === "native"
                      ? `${extension.engine ?? "connector"} · ABI ${extension.abiVersion ?? "?"}`
                      : extension.hostFeatures.join(", ")}
                  </p>
                  <div className="extension-meta">
                    <span
                      className={`extension-state ${extension.enabled ? "on" : "off"}`}
                    >
                      {extension.enabled
                        ? t("settings.extensions.enabled")
                        : t("settings.extensions.disabled")}
                    </span>
                    <span>
                      {t("settings.extensions.verifiedDigest", {
                        digest: extension.sha256.slice(0, 12),
                      })}
                    </span>
                  </div>
                </div>
                <div className="extension-actions">
                  {canUpdate && catalog ? (
                    <button
                      type="button"
                      className="text-button primary"
                      disabled={busy}
                      onClick={() => onInstall(catalog)}
                    >
                      <Download size={14} />
                      {t("settings.extensions.update")}
                    </button>
                  ) : null}
                  {/* The toggle used to be a neutral button whose only clue
                      to the current state was the verb on it, sitting beside a
                      grey "Enabled"/"Disabled" word in the same weight as the
                      digest next to it. Colour the action instead: turning a
                      working extension off is the cautionary one, turning a
                      dormant one on is not. */}
                  <button
                    type="button"
                    className={`text-button ${extension.enabled ? "caution" : "affirm"}`}
                    disabled={busy}
                    onClick={() => onToggle(extension)}
                  >
                    <Power size={14} />
                    {extension.enabled
                      ? t("settings.extensions.disable")
                      : t("settings.extensions.enable")}
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => onUninstall(extension)}
                  >
                    <Trash2 size={14} />
                    {t("settings.extensions.uninstall")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export interface ExtensionsTabProps {
  t: TranslateFn;
  active: boolean;
}

export function ExtensionsTab({ t, active }: ExtensionsTabProps) {
  const { confirm, confirmElement } = useConfirm();
  const [pluginStore, setPluginStore] = useState<PluginStoreCatalog>(
    bundledPluginStoreCatalog,
  );
  const installedExtensions = useExtensionRuntimeStore(
    (state) => state.installedExtensions,
  );
  const setInstalledExtensions = useExtensionRuntimeStore(
    (state) => state.setInstalledExtensions,
  );
  const [nativeTarget, setNativeTarget] = useState<string | null>(null);
  const [pluginStoreLoading, setPluginStoreLoading] = useState(false);
  const [pluginStoreError, setPluginStoreError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [pluginSearch, setPluginSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);

  const catalogById = useMemo(
    () =>
      new Map(
        pluginStore.extensions.map((extension) => [extension.id, extension]),
      ),
    [pluginStore.extensions],
  );
  const installedById = useMemo(
    () =>
      new Map(
        installedExtensions.map((extension) => [extension.id, extension]),
      ),
    [installedExtensions],
  );
  const filteredPluginStoreExtensions = useMemo(() => {
    const term = pluginSearch.trim().toLowerCase();
    if (!term) {
      return pluginStore.extensions;
    }
    return pluginStore.extensions.filter((extension) =>
      [
        extension.name,
        extension.id,
        extension.publisher,
        extension.summary,
        extension.engines.join(" "),
        extension.categories.join(" "),
        extension.topics.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [pluginSearch, pluginStore.extensions]);
  // Pairs rather than ids: the batch needs the catalog entry to install and the
  // installed record to report which one failed, and re-deriving either from an
  // id at click time would read a catalog that may have refreshed since.
  const updatableExtensions = useMemo(
    () =>
      installedExtensions.flatMap((extension) => {
        const catalog = catalogById.get(extension.id);
        return isExtensionUpdatable(catalog, extension.version, nativeTarget) &&
          catalog
          ? [{ installed: extension, catalog }]
          : [];
      }),
    [catalogById, installedExtensions, nativeTarget],
  );

  const recommendedPluginStoreExtensions = useMemo(
    () =>
      pluginStore.extensions.filter((extension) =>
        ["duckdb", "snowflake", "bigquery", "cloudSpanner", "dynamodb"].some(
          (engine) => extension.engines.includes(engine),
        ),
      ),
    [pluginStore.extensions],
  );

  const refresh = useCallback(async () => {
    setPluginStoreLoading(true);
    setPluginStoreError(null);
    setRuntimeError(null);
    const [catalogResult, runtimeResult] = await Promise.allSettled([
      fetchPluginStoreCatalog(defaultPluginStoreCatalogUrl),
      Promise.all([extTarget(), extList()]),
    ]);
    if (catalogResult.status === "fulfilled") {
      setPluginStore(catalogResult.value);
    } else {
      setPluginStore(bundledPluginStoreCatalog);
      setPluginStoreError(errorMessage(catalogResult.reason));
    }
    if (runtimeResult.status === "fulfilled") {
      setNativeTarget(runtimeResult.value[0]);
      setInstalledExtensions(runtimeResult.value[1]);
    } else {
      setNativeTarget(null);
      setInstalledExtensions([]);
      setRuntimeError(errorMessage(runtimeResult.reason));
    }
    setPluginStoreLoading(false);
  }, []);

  useEffect(() => {
    if (active) {
      void refresh();
    }
  }, [active, refresh]);

  // The install itself, with no prompting and no list refresh. `installOrUpdate`
  // wraps it in a per-extension confirmation; the batch update confirms once for
  // the whole set and refreshes after the last one, so neither the dialog nor the
  // `extList()` round trip can be per-item there.
  // Throws on failure: the batch needs to tell which entries failed apart from
  // those that succeeded, which a swallowed error cannot express.
  const performInstall = useCallback(
    async (extension: PluginStoreExtension) => {
      const install = extension.install;
      const asset = nativeTarget
        ? resolvePluginStoreInstallAsset(extension, nativeTarget)
        : undefined;
      if (!install || !asset || !nativeTarget) {
        throw new Error(t("settings.extensions.targetUnavailable"));
      }
      assertSupportedInstallKind(install);
      await extInstall({
        id: extension.id,
        version: extension.version,
        kind: install.kind,
        repository: extension.repository,
        assetName: asset.name,
        tag: install.tag,
        sha256: asset.sha256,
        permissions: extension.permissions,
        manifestPath: install.manifestPath,
      });
    },
    [nativeTarget, t],
  );

  const installOrUpdate = useCallback(
    async (extension: PluginStoreExtension) => {
      const install = extension.install;
      const asset = nativeTarget
        ? resolvePluginStoreInstallAsset(extension, nativeTarget)
        : undefined;
      if (!install || !asset || !nativeTarget) {
        setRuntimeError(t("settings.extensions.targetUnavailable"));
        return;
      }
      // Fail early on an install source the backend cannot handle (#160):
      // before the permission prompt and before any install IPC.
      try {
        assertSupportedInstallKind(install);
      } catch (error) {
        setRuntimeError(
          error instanceof UnsupportedInstallKindError
            ? t("settings.extensions.unsupportedInstallKind", {
                kind: error.kind,
              })
            : errorMessage(error),
        );
        return;
      }
      const existing = installedById.get(extension.id);
      const confirmed = await confirm({
        title: existing
          ? t("settings.extensions.confirmUpdateTitle", {
              name: extension.name,
            })
          : t("settings.extensions.confirmInstallTitle", {
              name: extension.name,
            }),
        message: t("settings.extensions.confirmInstallMessage", {
          version: extension.version,
          permissions: extension.permissions.join(", "),
        }),
        confirmLabel: existing
          ? t("settings.extensions.update")
          : t("settings.extensions.install"),
      });
      if (!confirmed) {
        return;
      }
      setOperationId(extension.id);
      setRuntimeError(null);
      try {
        await performInstall(extension);
        setInstalledExtensions(await extList());
      } catch (error) {
        setRuntimeError(errorMessage(error));
      } finally {
        setOperationId(null);
      }
    },
    [
      confirm,
      installedById,
      nativeTarget,
      performInstall,
      setInstalledExtensions,
      t,
    ],
  );

  const updateAll = useCallback(async () => {
    if (updatableExtensions.length === 0) {
      return;
    }
    const confirmed = await confirm({
      title: t("settings.extensions.confirmUpdateAllTitle", {
        count: updatableExtensions.length,
      }),
      message: t("settings.extensions.confirmUpdateAllMessage", {
        extensions: updatableExtensions
          .map(
            ({ installed, catalog }) =>
              `${installed.name} ${installed.version} → ${catalog.version}`,
          )
          .join("\n"),
      }),
      confirmLabel: t("settings.extensions.updateAllAction"),
    });
    if (!confirmed) {
      return;
    }
    setRuntimeError(null);
    // Sequential on purpose. The backend serialises installs behind a single
    // lock anyway, and running them one at a time keeps `operationId` pointing
    // at the extension actually being written.
    const failures: string[] = [];
    for (const { installed, catalog } of updatableExtensions) {
      setOperationId(catalog.id);
      try {
        await performInstall(catalog);
      } catch (error) {
        // One bad entry must not strand the rest: a failed signature check on
        // a single extension would otherwise hold back every later update.
        failures.push(`${installed.name}: ${errorMessage(error)}`);
      }
    }
    setOperationId(null);
    // Refresh regardless of failures — the ones that did land must show their
    // new versions, and a stale list would offer to update them again.
    try {
      setInstalledExtensions(await extList());
    } catch (error) {
      failures.push(errorMessage(error));
    }
    if (failures.length > 0) {
      setRuntimeError(
        t("settings.extensions.updateAllFailed", {
          failures: failures.join("; "),
        }),
      );
    }
  }, [confirm, performInstall, setInstalledExtensions, t, updatableExtensions]);

  const toggleExtension = useCallback(async (extension: InstalledExtension) => {
    setOperationId(extension.id);
    setRuntimeError(null);
    try {
      await extSetEnabled(extension.id, !extension.enabled);
      setInstalledExtensions(await extList());
    } catch (error) {
      setRuntimeError(errorMessage(error));
    } finally {
      setOperationId(null);
    }
  }, []);

  const uninstallExtension = useCallback(
    async (extension: InstalledExtension) => {
      const confirmed = await confirm({
        title: t("settings.extensions.confirmUninstallTitle", {
          name: extension.name,
        }),
        message: t("settings.extensions.confirmUninstallMessage"),
        confirmLabel: t("settings.extensions.uninstall"),
        tone: "danger",
      });
      if (!confirmed) {
        return;
      }
      setOperationId(extension.id);
      setRuntimeError(null);
      try {
        await extUninstall(extension.id);
        setInstalledExtensions(await extList());
      } catch (error) {
        setRuntimeError(errorMessage(error));
      } finally {
        setOperationId(null);
      }
    },
    [confirm, t],
  );

  return (
    <div className="settings-extensions">
      <div className="extension-search">
        <Search size={15} />
        <input
          type="search"
          value={pluginSearch}
          placeholder={t("settings.extensions.search")}
          aria-label={t("settings.extensions.search")}
          onChange={(event) => setPluginSearch(event.currentTarget.value)}
        />
        <button
          type="button"
          className="icon-button"
          title={t("settings.extensions.refresh")}
          aria-label={t("settings.extensions.refresh")}
          disabled={pluginStoreLoading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="extension-store-note">
        <span>
          {pluginStoreLoading
            ? t("settings.extensions.loading")
            : t("settings.extensions.source", {
                source: pluginStore.source,
              })}
        </span>
        {nativeTarget ? (
          <small>
            {t("settings.extensions.target", { target: nativeTarget })}
          </small>
        ) : null}
        <button
          type="button"
          className="text-button"
          onClick={() => openExternalUrl(defaultPluginStoreCatalogUrl)}
        >
          {t("settings.extensions.openStore")}
        </button>
      </div>
      {pluginStoreError ? (
        <div className="inline-error settings-json-error">
          <AlertTriangle size={15} />
          <span>{pluginStoreError}</span>
        </div>
      ) : null}
      {runtimeError ? (
        <div className="inline-error settings-json-error">
          <AlertTriangle size={15} />
          <span>{runtimeError}</span>
        </div>
      ) : null}
      <div className="extension-runtime-notice">
        <AlertTriangle size={15} />
        <span>{t("settings.extensions.runtimeNotice")}</span>
      </div>
      <InstalledSection
        installed={installedExtensions}
        catalogById={catalogById}
        nativeTarget={nativeTarget}
        operationId={operationId}
        t={t}
        updatableCount={updatableExtensions.length}
        onInstall={(extension) => void installOrUpdate(extension)}
        onToggle={(extension) => void toggleExtension(extension)}
        onUninstall={(extension) => void uninstallExtension(extension)}
        onUpdateAll={() => void updateAll()}
      />
      <MarketplaceSection
        title={t("settings.extensions.marketplace")}
        empty={t("settings.extensions.noMatches")}
        extensions={filteredPluginStoreExtensions}
        installedById={installedById}
        nativeTarget={nativeTarget}
        operationId={operationId}
        showUnavailable={showUnavailable}
        t={t}
        onInstall={(extension) => void installOrUpdate(extension)}
        onToggleUnavailable={() => setShowUnavailable((value) => !value)}
      />
      <MarketplaceSection
        title={t("settings.extensions.recommended")}
        empty={t("settings.extensions.noRecommended")}
        extensions={recommendedPluginStoreExtensions}
        installedById={installedById}
        nativeTarget={nativeTarget}
        operationId={operationId}
        showUnavailable={showUnavailable}
        t={t}
        onInstall={(extension) => void installOrUpdate(extension)}
        onToggleUnavailable={() => setShowUnavailable((value) => !value)}
      />
      {confirmElement}
    </div>
  );
}
