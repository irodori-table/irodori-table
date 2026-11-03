import { useEffect } from "react";
import type { ShowActionNotice } from "@/app/ActionToast";
import { tauriRuntimeError } from "@/app/app-workbench-utils";
import { errorMessage } from "@/core";
import { appInstalledFromNixStore } from "@/generated/irodori-api";
import type { Translator } from "@/i18n";

export type AppUpdateInfo = {
  currentVersion: string;
  version: string;
  /**
   * Set when this install lives in the Nix store. It cannot replace itself
   * (the store is read-only, and the `.deb` the updater would fetch needs
   * dpkg), so the update is announced without an Install action and the user
   * is sent to their package manager.
   */
  packageManaged: boolean;
};

async function installedFromNixStore(): Promise<boolean> {
  // An older backend without the command, or any other failure, falls back to
  // offering the in-app install, which is what every other install gets.
  return appInstalledFromNixStore().catch(() => false);
}

let startupUpdateCheckStarted = false;

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (tauriRuntimeError()) {
    return null;
  }
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    return null;
  }
  const info = {
    currentVersion: update.currentVersion,
    version: update.version,
    packageManaged: await installedFromNixStore(),
  };
  await update.close().catch(() => undefined);
  return info;
}

/**
 * Announce an available update. Installs that can update themselves get an
 * Install action; a Nix store install is told to use its package manager.
 */
export function offerAppUpdate(
  update: AppUpdateInfo,
  showActionNotice: ShowActionNotice,
  t: Translator["t"],
) {
  const versions = { current: update.currentVersion, next: update.version };
  if (update.packageManaged) {
    showActionNotice(
      "info",
      t("notice.update.available"),
      t("notice.update.packageManagedDetail", versions),
    );
    return;
  }
  showActionNotice(
    "info",
    t("notice.update.available"),
    t("notice.update.availableDetail", versions),
    {
      action: {
        label: t("notice.update.install"),
        run: () => void downloadAndInstallLatestUpdate(showActionNotice, t),
      },
    },
  );
}

export async function downloadAndInstallLatestUpdate(
  showActionNotice: ShowActionNotice,
  t: Translator["t"],
) {
  try {
    if (tauriRuntimeError()) {
      showActionNotice("error", t("notice.update.runtimeUnavailable"));
      return;
    }
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      showActionNotice("info", t("notice.update.none"));
      return;
    }
    if (await installedFromNixStore()) {
      await update.close().catch(() => undefined);
      showActionNotice(
        "info",
        t("notice.update.available"),
        t("notice.update.packageManagedDetail", {
          current: update.currentVersion,
          next: update.version,
        }),
      );
      return;
    }
    try {
      showActionNotice(
        "info",
        t("notice.update.installing"),
        t("notice.update.availableDetail", {
          current: update.currentVersion,
          next: update.version,
        }),
      );
      await update.downloadAndInstall();
    } finally {
      await update.close().catch(() => undefined);
    }
    showActionNotice(
      "success",
      t("notice.update.installed"),
      t("notice.update.restartRequired"),
    );
  } catch (error) {
    showActionNotice(
      "error",
      t("notice.update.installFailed"),
      errorMessage(error),
    );
  }
}

export async function checkAndOfferAppUpdate(
  showActionNotice: ShowActionNotice,
  t: Translator["t"],
) {
  try {
    const update = await checkForAppUpdate();
    if (!update) {
      showActionNotice("info", t("notice.update.none"));
      return;
    }
    offerAppUpdate(update, showActionNotice, t);
  } catch (error) {
    showActionNotice(
      "error",
      t("notice.update.checkFailed"),
      errorMessage(error),
    );
  }
}

export function useStartupUpdateCheck({
  enabled,
  showActionNotice,
  t,
}: {
  enabled: boolean;
  showActionNotice: ShowActionNotice;
  t: Translator["t"];
}) {
  useEffect(() => {
    if (!enabled || startupUpdateCheckStarted) {
      return;
    }
    startupUpdateCheckStarted = true;
    let cancelled = false;

    void checkForAppUpdate()
      .then((update) => {
        if (cancelled || !update) {
          return;
        }
        offerAppUpdate(update, showActionNotice, t);
      })
      .catch((error) => {
        console.warn("Irodori update check failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, showActionNotice, t]);
}
