import type { ConfirmOptions } from "@/components/ConfirmDialog";
import type { QueryParameterInput } from "@/generated/irodori-api";
import type { Translator } from "@/i18n";
import { sqlNeedsWriteReview } from "@/sql/read-only";
import { useConnectionStore } from "./connection-store";

export type ConnectionWriteTarget = {
  id: string;
  name: string;
  database: string;
  reviewWrites: boolean;
  revision: number;
  isCurrent: () => boolean;
};
type Confirm = (options: ConfirmOptions) => Promise<boolean>;

export function writeTargetLabel(
  target: ConnectionWriteTarget,
  t: Translator["t"],
) {
  return t("query.reviewWrites.target", {
    id: target.id,
    name: target.name,
    database: target.database,
  });
}

export async function confirmConnectionOperation(
  target: ConnectionWriteTarget,
  confirm: Confirm,
  options: ConfirmOptions,
): Promise<boolean> {
  if (!target.isCurrent()) return false;
  const controller = new AbortController();
  const unsubscribe = useConnectionStore.subscribe(() => {
    if (!target.isCurrent()) controller.abort();
  });
  try {
    return (
      (await confirm({ ...options, signal: controller.signal })) &&
      target.isCurrent()
    );
  } finally {
    unsubscribe();
  }
}

export async function reviewEditorWrite(
  target: ConnectionWriteTarget,
  sql: string,
  params: QueryParameterInput[] | undefined,
  confirm: Confirm,
  t: Translator["t"],
) {
  if (!target.reviewWrites || !sqlNeedsWriteReview(sql))
    return target.isCurrent();
  return confirmConnectionOperation(target, confirm, {
    title: t("query.reviewWrites.title"),
    message: (
      <>
        <p>{writeTargetLabel(target, t)}</p>
        <pre className="sql-preview">{sql}</pre>
        {params?.length ? (
          <>
            <strong>{t("query.reviewWrites.parameters")}</strong>
            <pre className="sql-preview">{JSON.stringify(params, null, 2)}</pre>
          </>
        ) : null}
      </>
    ),
    confirmLabel: t("query.reviewWrites.confirm"),
    tone: "danger",
  });
}
