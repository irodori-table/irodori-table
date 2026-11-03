import { describe, expect, it, vi } from "vitest";
import type { ShowActionNotice } from "@/app/ActionToast";
import { offerAppUpdate } from "@/features/updater/use-startup-update-check";
import { createTranslator } from "@/i18n";

/**
 * A Nix store install cannot replace itself: the store is read-only and the
 * `.deb` the updater would fetch needs dpkg. Offering Install there could only
 * end in "Update install failed", so such installs are pointed at their
 * package manager instead, and every other install keeps its Install action.
 */

const { t } = createTranslator("en");

describe("offerAppUpdate", () => {
  it("offers the in-app install to installs that can update themselves", () => {
    const showActionNotice = vi.fn<ShowActionNotice>();

    offerAppUpdate(
      { currentVersion: "0.11.19", version: "0.11.20", packageManaged: false },
      showActionNotice,
      t,
    );

    expect(showActionNotice).toHaveBeenCalledTimes(1);
    const [kind, title, detail, options] = showActionNotice.mock.calls[0];
    expect(kind).toBe("info");
    expect(title).toBe(t("notice.update.available"));
    expect(detail).toBe("0.11.19 -> 0.11.20");
    expect(options?.action?.label).toBe(t("notice.update.install"));
  });

  it("sends a Nix store install to its package manager without an Install action", () => {
    const showActionNotice = vi.fn<ShowActionNotice>();

    offerAppUpdate(
      { currentVersion: "0.11.19", version: "0.11.20", packageManaged: true },
      showActionNotice,
      t,
    );

    expect(showActionNotice).toHaveBeenCalledTimes(1);
    const [kind, title, detail, options] = showActionNotice.mock.calls[0];
    expect(kind).toBe("info");
    expect(title).toBe(t("notice.update.available"));
    expect(detail).toContain("0.11.19 -> 0.11.20");
    expect(detail).toContain("package manager");
    expect(options?.action).toBeUndefined();
  });
});
