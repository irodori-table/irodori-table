import type { Translator } from "@/i18n";
import type { GitRepoSetupReason } from "./git-store";

const reasonMessageKey = {
  unconfigured: "git.setup.unconfigured",
  missing: "git.setup.missing",
  notRepository: "git.setup.notRepository",
} as const;

export function GitSetupView({
  reason,
  repoPath,
  busy,
  onOpenRepository,
  onInitRepository,
  t,
}: {
  reason: GitRepoSetupReason;
  repoPath: string;
  busy: boolean;
  onOpenRepository: () => void;
  onInitRepository: () => void;
  t: Translator["t"];
}) {
  return (
    <div className="empty-browser-cta git-setup">
      <p>{t(reasonMessageKey[reason])}</p>
      {reason !== "unconfigured" && repoPath ? (
        <small title={repoPath}>{repoPath}</small>
      ) : null}
      <button
        type="button"
        className="text-button primary"
        disabled={busy}
        onClick={onOpenRepository}
      >
        {t("git.setup.openRepository")}
      </button>
      {/* Only a folder that exists and sits outside any repository can be
          initialized; the backend refuses everything else anyway. */}
      {reason === "notRepository" ? (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={onInitRepository}
        >
          {t("git.setup.initRepository")}
        </button>
      ) : null}
    </div>
  );
}
