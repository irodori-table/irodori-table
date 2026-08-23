import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionsTab } from "@/features/settings/tabs/ExtensionsTab";
import {
  fetchPluginStoreCatalog,
  type PluginStoreInstallKind,
} from "@/features/extensions/plugin-store";
import { useExtensionRuntimeStore } from "@/features/extensions/runtime-store";
import { extInstall, extList, extTarget } from "@/generated/irodori-api";
import { createTranslator } from "@/i18n";
import { componentRenderer } from "@/tests/helpers/render";

vi.mock("@/generated/irodori-api", () => ({
  extInstall: vi.fn(),
  extList: vi.fn(),
  extSetEnabled: vi.fn(),
  extTarget: vi.fn(),
  extUninstall: vi.fn(),
}));

vi.mock("@/features/extensions/plugin-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/extensions/plugin-store")>();
  return { ...actual, fetchPluginStoreCatalog: vi.fn() };
});

const mockExtTarget = vi.mocked(extTarget);
const mockExtList = vi.mocked(extList);
const mockFetchCatalog = vi.mocked(fetchPluginStoreCatalog);

const sha256 = `sha256:${"a".repeat(64)}`;

function catalogExtension(
  id: string,
  targets: readonly string[],
  kind: PluginStoreInstallKind = "githubRelease",
) {
  return {
    id,
    name: id,
    publisher: "irodori",
    version: "1.0.0",
    apiVersion: "1",
    summary: `${id} summary`,
    license: "MIT",
    repository: `https://github.com/hjosugi/${id}`,
    categories: [],
    topics: [],
    // Not one of the "recommended" engines, so entries land only in the
    // Marketplace section and the assertions stay unambiguous.
    engines: ["postgres"],
    permissions: [],
    runtime: "native" as const,
    verified: true,
    publishedAt: "2026-01-01T00:00:00Z",
    install: {
      kind,
      url: `https://github.com/hjosugi/${id}/releases`,
      tag: "v1.0.0",
      assets: Object.fromEntries(
        targets.map((target) => [target, { name: `${id}.tar.gz`, sha256 }]),
      ),
    },
  };
}

function catalog() {
  return {
    schemaVersion: 1 as const,
    updatedAt: "2026-01-01T00:00:00Z",
    source: "test-catalog",
    extensions: [
      catalogExtension("works-here", ["x86_64-linux"]),
      catalogExtension("elsewhere-only", ["x86_64-macos"]),
    ],
  };
}

function installedExtension(id: string, version: string) {
  return {
    id,
    name: id,
    version,
    runtime: "native",
    engine: "postgres",
    hostFeatures: [],
    sha256: "b".repeat(64),
    enabled: true,
    installedAt: "1786091256",
    abiVersion: 1,
    supportedCalls: ["connect"],
  };
}

const renderTab = componentRenderer(ExtensionsTab, () => ({
  t: createTranslator("en").t,
  active: true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCatalog.mockResolvedValue(catalog());
  mockExtList.mockResolvedValue([]);
  // The runtime store is a module singleton, so an installed list set by one
  // test is still there for the next one's first paint — before its own
  // `refresh()` resolves and replaces it. A leaked row renders the same
  // extension name in both the Installed and Marketplace sections, which is
  // enough to make a by-name query in a later test ambiguous.
  useExtensionRuntimeStore.getState().setInstalledExtensions([]);
});

describe("ExtensionsTab marketplace availability filter (#131)", () => {
  it("hides entries with no install asset for the current platform", async () => {
    mockExtTarget.mockResolvedValue("x86_64-linux");
    renderTab();

    expect(await screen.findByText("works-here")).toBeInTheDocument();
    expect(screen.queryByText("elsewhere-only")).toBeNull();
    expect(
      screen.getByRole("button", { name: "1 hidden for this platform" }),
    ).toBeInTheDocument();
  });

  it("reveals the hidden entries when the count note is clicked", async () => {
    mockExtTarget.mockResolvedValue("x86_64-linux");
    const { user } = renderTab();

    await screen.findByText("works-here");
    await user.click(
      screen.getByRole("button", { name: "1 hidden for this platform" }),
    );

    expect(screen.getByText("elsewhere-only")).toBeInTheDocument();
    // The unresolvable entry keeps its disabled "Unavailable" action.
    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();

    // The note flips into an explicit way back to the filtered view.
    await user.click(screen.getByRole("button", { name: "Hide unavailable" }));
    expect(screen.queryByText("elsewhere-only")).toBeNull();
  });

  it("rejects a non-githubRelease install kind before confirming or calling the backend (#160)", async () => {
    mockExtTarget.mockResolvedValue("x86_64-linux");
    mockFetchCatalog.mockResolvedValue({
      ...catalog(),
      extensions: [catalogExtension("git-only", ["x86_64-linux"], "git")],
    });
    const { user } = renderTab();

    await screen.findByText("git-only");
    await user.click(screen.getByRole("button", { name: "Install" }));

    // The unsupported kind fails early with a clear message…
    expect(
      await screen.findByText(/install kind .*git.* is not supported/i),
    ).toBeInTheDocument();
    // …before the permission prompt and before any backend install call.
    expect(screen.queryByText("Install git-only?")).toBeNull();
    expect(extInstall).not.toHaveBeenCalled();
  });

  it("updates every outdated extension from one action", async () => {
    mockExtTarget.mockResolvedValue("x86_64-linux");
    mockFetchCatalog.mockResolvedValue({
      ...catalog(),
      extensions: [
        catalogExtension("works-here", ["x86_64-linux"]),
        catalogExtension("also-here", ["x86_64-linux"]),
      ],
    });
    mockExtList.mockResolvedValue([
      // 0.9.0 is behind the catalog's 1.0.0…
      installedExtension("works-here", "0.9.0"),
      installedExtension("also-here", "0.9.0"),
      // …and this one is already current, so the batch must leave it alone.
      installedExtension("current", "1.0.0"),
    ]);
    const { user } = renderTab();

    const updateAll = await screen.findByRole("button", {
      name: "Update all (2)",
    });
    await user.click(updateAll);
    await user.click(await screen.findByRole("button", { name: "Update all" }));

    expect(extInstall).toHaveBeenCalledTimes(2);
    const updated = vi
      .mocked(extInstall)
      .mock.calls.map(([request]) => request.id);
    expect(updated).toEqual(["works-here", "also-here"]);
  });

  it("keeps updating after one extension fails, and names the one that did", async () => {
    mockExtTarget.mockResolvedValue("x86_64-linux");
    mockFetchCatalog.mockResolvedValue({
      ...catalog(),
      extensions: [
        catalogExtension("breaks", ["x86_64-linux"]),
        catalogExtension("works-here", ["x86_64-linux"]),
      ],
    });
    mockExtList.mockResolvedValue([
      installedExtension("breaks", "0.9.0"),
      installedExtension("works-here", "0.9.0"),
    ]);
    // Scoped to this test: `vi.clearAllMocks()` in `beforeEach` clears
    // recorded calls but leaves implementations in place, so a persistent
    // stub here would follow `extInstall` into every later test.
    vi.mocked(extInstall).mockImplementationOnce(async () => {
      throw new Error("archive sha256 mismatch");
    });
    const { user } = renderTab();

    await user.click(
      await screen.findByRole("button", { name: "Update all (2)" }),
    );
    await user.click(await screen.findByRole("button", { name: "Update all" }));

    // The failure is reported by name rather than swallowed…
    expect(await screen.findByText(/breaks: .*sha256 mismatch/)).toBeVisible();
    // …and it did not strand the extension queued behind it.
    expect(extInstall).toHaveBeenCalledTimes(2);
  });

  it("offers no batch action when every extension is current", async () => {
    mockExtTarget.mockResolvedValue("x86_64-linux");
    mockExtList.mockResolvedValue([installedExtension("works-here", "1.0.0")]);
    renderTab();

    // Waits on the installed row itself: the same name is also in the
    // marketplace list, so a bare text query would match both sections.
    expect(
      await screen.findByRole("button", { name: "Uninstall" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Update all/ })).toBeNull();
  });

  it("shows every entry when no runtime target exists (browser harness)", async () => {
    // Outside Tauri `extTarget()` rejects; nothing is resolvable then, so
    // filtering would render an empty marketplace. No target means no filter.
    mockExtTarget.mockRejectedValue(new Error("tauri runtime unavailable"));
    renderTab();

    expect(await screen.findByText("works-here")).toBeInTheDocument();
    expect(screen.getByText("elsewhere-only")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /hidden for this platform/ }),
    ).toBeNull();
  });
});
