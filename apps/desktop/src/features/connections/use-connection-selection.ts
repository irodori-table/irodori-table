import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import type { Translator } from "@/i18n";
import { groupConnectionProfiles } from "./connection-groups";
import type { ConnectionDraft } from "./connection-profiles";

/**
 * The profile list's selection: which environment groups are collapsed, which
 * rows are multi-selected, and what Delete would act on.
 *
 * Shared by the picker (where rows are clicked) and the form footer (where the
 * Delete button lives), so it lives in the dialog rather than in either.
 */
export function useConnectionSelection({
  profiles,
  draft,
  t,
  onSelectProfile,
  onDeleteProfiles,
}: {
  profiles: ConnectionDraft[];
  draft: ConnectionDraft;
  t: Translator["t"];
  onSelectProfile: (profile: ConnectionDraft) => void;
  onDeleteProfiles: (ids: string[]) => void;
}) {
  const { confirm, confirmElement } = useConfirm();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  // Multi-selection for bulk delete: shift+click selects a range, ctrl/cmd
  // +click toggles, plain click collapses back to the single form target.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectionAnchorRef = useRef<string | null>(null);
  const groupedProfiles = useMemo(
    () => groupConnectionProfiles(profiles),
    [profiles],
  );
  // Shift-ranges follow what the user can see: profiles in expanded groups,
  // in rendered order.
  const visibleProfileIds = useMemo(
    () =>
      groupedProfiles
        .filter((group) => !collapsedGroups.has(group.id))
        .flatMap((group) => group.profiles.map((profile) => profile.id)),
    [collapsedGroups, groupedProfiles],
  );

  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) {
        return current;
      }
      const valid = new Set(profiles.map((profile) => profile.id));
      const next = new Set(Array.from(current).filter((id) => valid.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [profiles]);

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function handleProfileClick(
    event: ReactMouseEvent<HTMLButtonElement>,
    profile: ConnectionDraft,
  ) {
    if (event.shiftKey && selectionAnchorRef.current) {
      const anchorIndex = visibleProfileIds.indexOf(selectionAnchorRef.current);
      const targetIndex = visibleProfileIds.indexOf(profile.id);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] =
          anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
        setSelectedIds(new Set(visibleProfileIds.slice(start, end + 1)));
        onSelectProfile(profile);
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      selectionAnchorRef.current = profile.id;
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(profile.id)) {
          next.delete(profile.id);
        } else {
          next.add(profile.id);
        }
        return next;
      });
      onSelectProfile(profile);
      return;
    }
    selectionAnchorRef.current = profile.id;
    setSelectedIds(new Set());
    onSelectProfile(profile);
  }

  // Right-clicking outside the current selection retargets to just this row;
  // right-clicking within a multi-selection keeps it so the menu can act on
  // the whole set.
  function retargetSelection(profileId: string) {
    if (!selectedIds.has(profileId)) {
      selectionAnchorRef.current = profileId;
      setSelectedIds(new Set([profileId]));
    }
  }

  // Something must actually be deletable: either a multi-selection (pruned to
  // saved profiles by the effect above) or a draft that matches a saved
  // profile. Without this the footer's Delete asked to remove a connection
  // that did not exist yet (#143).
  const deleteTargetExists =
    selectedIds.size > 0 || profiles.some((profile) => profile.id === draft.id);

  // Delete the multi-selection when present, otherwise the profile loaded in
  // the form. Always routed through the shared confirm dialog.
  function requestDeleteSelected() {
    if (!deleteTargetExists) {
      return;
    }
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : [draft.id];
    const count = ids.length;
    const singleProfile = profiles.find((profile) => profile.id === ids[0]);
    const singleName =
      ids[0] === draft.id
        ? draft.name.trim() || draft.id
        : singleProfile?.name.trim() || ids[0];
    void confirm({
      title:
        count > 1
          ? t("connection.confirmDelete.titleMany", { count })
          : t("connection.confirmDelete.title"),
      message:
        count > 1
          ? t("connection.confirmDelete.messageMany", { count })
          : t("connection.confirmDelete.message", { name: singleName }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    }).then((confirmed) => {
      if (confirmed) {
        setSelectedIds(new Set());
        onDeleteProfiles(ids);
      }
    });
  }

  return {
    collapsedGroups,
    selectedIds,
    groupedProfiles,
    deleteTargetExists,
    confirmElement,
    toggleGroup,
    handleProfileClick,
    retargetSelection,
    requestDeleteSelected,
  };
}

export type ConnectionSelection = ReturnType<typeof useConnectionSelection>;
