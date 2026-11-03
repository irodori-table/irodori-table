import { describe, expect, it, vi } from "vitest";
import {
  useConnectionActions,
  type ConnectionActionsDeps,
} from "@/app/controllers/use-connection-actions";
import { resolveValue, type ValueUpdater } from "@/core";
import { newDraft, type ConnectionDraft } from "@/features/connections";
import { createTranslator } from "@/i18n";

/**
 * Add opens a blank form; it does not save anything. A connection joins the
 * saved list only when it is saved (or connected, which saves first), so
 * pressing Add and closing the manager leaves the list as it was.
 */

const { t } = createTranslator("en");

function savedProfile(id: string, name: string): ConnectionDraft {
  return { ...newDraft(1), id, name, host: "db.internal", database: "app" };
}

function harness(initial: {
  profiles: ConnectionDraft[];
  draft: ConnectionDraft;
}) {
  const state = {
    profiles: initial.profiles,
    draft: initial.draft,
    selectedProfileId: initial.draft.id,
  };
  const setter =
    <K extends keyof typeof state>(key: K) =>
    (value: ValueUpdater<(typeof state)[K]>) => {
      state[key] = resolveValue(state[key], value);
    };
  const showActionNotice = vi.fn();
  const actions = () =>
    useConnectionActions({
      draft: state.draft,
      profiles: state.profiles,
      connectedIds: new Set(),
      activeConnectionId: "",
      setDraft: setter("draft"),
      setProfiles: setter("profiles"),
      setSelectedProfileId: setter("selectedProfileId"),
      setConnectionError: vi.fn(),
      setActiveConnectionId: vi.fn(),
      setConnectionSearch: vi.fn(),
      setConnectedIds: vi.fn(),
      setLiveConnections: vi.fn(),
      setMetadataByConnection: vi.fn(),
      setMetadataErrors: vi.fn(),
      setMetadataLoading: vi.fn(),
      setTestingConnection: vi.fn(),
      setConnecting: vi.fn(),
      setConnectionManagerOpen: vi.fn(),
      showActionNotice,
      t,
      installedExtensions: [],
    } satisfies ConnectionActionsDeps);
  return { state, actions, showActionNotice };
}

describe("adding a connection", () => {
  it("opens a blank draft without saving it", () => {
    const existing = savedProfile("connection-1", "Warehouse");
    const { state, actions, showActionNotice } = harness({
      profiles: [existing],
      draft: existing,
    });

    actions().addProfile();

    expect(state.profiles).toEqual([existing]);
    expect(state.draft).toEqual(newDraft(2));
    expect(state.selectedProfileId).toBe("connection-2");
    expect(showActionNotice).not.toHaveBeenCalled();
  });

  it("saves the draft into the list once Save is pressed", () => {
    const { state, actions } = harness({ profiles: [], draft: newDraft(1) });

    actions().addProfile();
    actions().updateDraft({ name: "Local", database: "app" });
    expect(state.profiles).toEqual([]);

    expect(actions().saveDraft()).toBe(true);
    expect(state.profiles.map((profile) => profile.name)).toEqual(["Local"]);
  });

  it("keeps an unsaved draft's edits when closing prunes old empty rows", () => {
    // An untouched "Connection 1" saved by the old Add, still in the list.
    const leftover = newDraft(1);
    const { state, actions } = harness({
      profiles: [leftover],
      draft: leftover,
    });

    actions().addProfile();
    actions().updateDraft({ name: "Typed but not saved" });
    actions().prunePristineDrafts();

    expect(state.profiles).toEqual([]);
    expect(state.draft.name).toBe("Typed but not saved");
  });
});
