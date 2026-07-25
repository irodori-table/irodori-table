import { AlertTriangle, XCircle } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import type { JobList, JobSummary } from "../../../generated/irodori-api";
import type { TranslationKey } from "@/i18n";
import type { TranslateFn } from "./shared";

/** Format in the app locale (not the OS locale). */
function toCount(value: bigint | number, locale: string) {
  return Number(value).toLocaleString(locale);
}

const jobKindKeys = {
  knowledgeRefresh: "settings.jobs.kind.knowledgeRefresh",
  indexBuild: "settings.jobs.kind.indexBuild",
  mlEvaluation: "settings.jobs.kind.mlEvaluation",
  bulkEdit: "settings.jobs.kind.bulkEdit",
  sourceScan: "settings.jobs.kind.sourceScan",
} as const satisfies Partial<Record<JobSummary["kind"], TranslationKey>>;

const jobStatusKeys = {
  queued: "settings.jobs.status.queued",
  running: "settings.jobs.status.running",
  cancelling: "settings.jobs.status.cancelling",
  succeeded: "settings.jobs.status.succeeded",
  failed: "settings.jobs.status.failed",
  cancelled: "settings.jobs.status.cancelled",
} as const satisfies Record<JobSummary["status"], TranslationKey>;

/**
 * A job kind the backend added since this build shipped has no key yet, so it
 * falls back to its own identifier rather than rendering blank.
 */
function formatJobKind(t: TranslateFn, kind: JobSummary["kind"]) {
  const key = jobKindKeys[kind as keyof typeof jobKindKeys];
  return key ? t(key) : kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatJobStatus(t: TranslateFn, status: JobSummary["status"]) {
  return t(jobStatusKeys[status]);
}

function formatJobTime(value: bigint | undefined, locale: string) {
  if (value === undefined) {
    return "-";
  }
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatJobProgress(t: TranslateFn, job: JobSummary, locale: string) {
  const progress = job.progress;
  if (progress.total !== undefined) {
    return `${toCount(progress.completed, locale)} / ${toCount(progress.total, locale)} ${progress.unit}`;
  }
  if (progress.completed > 0n) {
    return `${toCount(progress.completed, locale)} ${progress.unit}`;
  }
  return progress.message ?? t("common.waiting");
}

export interface JobsTabProps {
  t: TranslateFn;
  jobs: JobList;
  jobsLoading: boolean;
  jobsError: string | null;
  refreshJobs: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
}

export function JobsTab({
  t,
  jobs,
  jobsLoading,
  jobsError,
  refreshJobs,
  cancelJob,
}: JobsTabProps) {
  const locale = usePreferencesStore((state) => state.locale);
  return (
    <div className="settings-jobs">
      <div className="settings-json-toolbar">
        <span>
          <strong>{t("settings.jobs.title")}</strong>
          <small>{t("settings.jobs.description")}</small>
        </span>
        <button
          className="text-button"
          type="button"
          onClick={() => void refreshJobs()}
          disabled={jobsLoading}
        >
          {jobsLoading ? t("common.refreshing") : t("common.refresh")}
        </button>
      </div>
      {jobsError ? (
        <div className="inline-error settings-json-error">
          <AlertTriangle size={13} />
          <span>{jobsError}</span>
        </div>
      ) : null}
      <section className="jobs-section">
        <div className="jobs-section-title">
          <strong>{t("settings.jobs.active")}</strong>
          <span>{jobs.active.length}</span>
        </div>
        {jobs.active.length > 0 ? (
          <div className="jobs-list">
            {jobs.active.map((job) => (
              <div className="job-row" key={job.id}>
                <div className="job-main">
                  <strong>{job.title}</strong>
                  <small>
                    {formatJobKind(t, job.kind)} ·{" "}
                    {formatJobStatus(t, job.status)} ·{" "}
                    {formatJobProgress(t, job, locale)}
                  </small>
                  {job.progress.percent !== undefined ? (
                    <div className="job-progress">
                      <span style={{ width: `${job.progress.percent}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="job-meta">
                  <small>
                    {t("settings.jobs.attempt", {
                      attempt: job.attempt,
                    })}
                  </small>
                  <button
                    className="icon-button"
                    type="button"
                    title={t("settings.jobs.cancel")}
                    aria-label={t("settings.jobs.cancel")}
                    disabled={
                      job.cancelRequested || job.status === "cancelling"
                    }
                    onClick={() => void cancelJob(job.id)}
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-browser">{t("settings.jobs.noActive")}</div>
        )}
      </section>
      <section className="jobs-section">
        <div className="jobs-section-title">
          <strong>{t("settings.jobs.history")}</strong>
          <span>{jobs.history.length}</span>
        </div>
        {jobs.history.length > 0 ? (
          <div className="jobs-list">
            {jobs.history.map((job) => (
              <div className={`job-row ${job.status}`} key={job.id}>
                <div className="job-main">
                  <strong>{job.title}</strong>
                  <small>
                    {formatJobKind(t, job.kind)} ·{" "}
                    {formatJobStatus(t, job.status)} ·{" "}
                    {formatJobTime(job.finishedAtMs ?? job.updatedAtMs, locale)}
                  </small>
                  {job.error ? (
                    <small className="job-error">{job.error.message}</small>
                  ) : job.latestLogMessage ? (
                    <small>{job.latestLogMessage}</small>
                  ) : null}
                </div>
                <div className="job-meta">
                  <small>
                    {job.artifactCount
                      ? t("settings.jobs.artifacts", {
                          count: job.artifactCount,
                        })
                      : t("settings.jobs.noArtifacts")}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-browser">{t("settings.jobs.noFinished")}</div>
        )}
      </section>
    </div>
  );
}
