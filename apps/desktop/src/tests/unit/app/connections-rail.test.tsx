// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ConnectionsRail } from "@/app/ConnectionsRail";
import type { Workbench } from "@/app/AppWorkbench";
import { WorkbenchProvider } from "@/app/workbench-context";
import { newDraft, useConnectionStore } from "@/features/connections";
import { renderUi } from "@/tests/helpers/render";

/**
 * The rail is the only always-visible way to move between connections, so its
 * left click has to *be* that move. It used to detour into the Connection
 * Manager whenever the profile happened to be closed, which turned "switch to
 * staging" into "a settings dialog opened". Editing and closing moved to the
 * right-click menu, where a secondary action belongs.
 *
 * It now lists open connections only. Listing every saved profile made "Close
 * connection" look like it had done nothing — the icon stayed put, because the
 * rail was showing profiles rather than connections. These tests pin the
 * distinction: closed profiles are absent, and the foot button is the way back
 * to them.
 */
// Built with the real draft factory so the store's persistence subscriber sees
// every field it expects.
function railProfiles() {
  return [
    { ...newDraft(1), id: "prod", name: "prod", engine: "postgres" as const },
    {
      ...newDraft(2),
      id: "staging",
      name: "staging",
      engine: "dynamodb" as const,
    },
  ];
}

function railHarness(connected: string[]) {
  const setActiveConnectionId = vi.fn();
  const setConnectionManagerOpen = vi.fn();
  const connectProfile = vi.fn(async () => {});
  const disconnectProfile = vi.fn(async () => {});
  const selectProfile = vi.fn();
  const addProfile = vi.fn();
  const workbench = {
    connections: {
      activeConnectionId: "prod",
      setActiveConnectionId,
      connectedIds: new Set(connected),
      setConnectionManagerOpen,
      connectionActions: {
        selectProfile,
        addProfile,
        connectProfile,
        disconnectProfile,
      },
    },
  } as unknown as Workbench;
  const { user } = renderUi(
    <WorkbenchProvider workbench={workbench}>
      <ConnectionsRail />
    </WorkbenchProvider>,
  );
  return {
    user,
    setActiveConnectionId,
    setConnectionManagerOpen,
    connectProfile,
    disconnectProfile,
    addProfile,
  };
}

describe("ConnectionsRail", () => {
  beforeEach(() => {
    useConnectionStore.setState({ profiles: railProfiles() });
  });

  it("switches to a connected profile on click without opening the manager", async () => {
    const rail = railHarness(["prod", "staging"]);

    await rail.user.click(screen.getByRole("listitem", { name: /staging/ }));

    expect(rail.setActiveConnectionId).toHaveBeenCalledWith("staging");
    expect(rail.connectProfile).not.toHaveBeenCalled();
    expect(rail.setConnectionManagerOpen).not.toHaveBeenCalled();
  });

  it("lists open connections only, so closing one removes it", () => {
    railHarness(["prod"]);

    expect(screen.getByRole("listitem", { name: /prod/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("listitem", { name: /staging/ }),
    ).not.toBeInTheDocument();
  });

  it("leaves an empty rail when nothing is open", () => {
    railHarness([]);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("offers edit and close on right click", async () => {
    const rail = railHarness(["prod", "staging"]);

    await rail.user.pointer({
      target: screen.getByRole("listitem", { name: /staging/ }),
      keys: "[MouseRight]",
    });

    await rail.user.click(screen.getByRole("menuitem", { name: /edit/i }));
    expect(rail.setConnectionManagerOpen).toHaveBeenCalledWith(true);

    await rail.user.pointer({
      target: screen.getByRole("listitem", { name: /staging/ }),
      keys: "[MouseRight]",
    });
    await rail.user.click(screen.getByRole("menuitem", { name: /close/i }));
    expect(rail.disconnectProfile).toHaveBeenCalledWith("staging");
  });

  // The only route back to a saved-but-closed profile once the rail stops
  // listing them, so it must reach the manager rather than start a new draft.
  it("opens the Connection Manager from the foot button without adding a profile", async () => {
    const rail = railHarness(["prod"]);

    await rail.user.click(
      screen.getByRole("button", { name: /open a connection/i }),
    );

    expect(rail.setConnectionManagerOpen).toHaveBeenCalledWith(true);
    expect(rail.addProfile).not.toHaveBeenCalled();
  });
});
