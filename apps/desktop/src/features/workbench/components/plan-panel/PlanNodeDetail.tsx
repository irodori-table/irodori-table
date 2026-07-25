import { Copy } from "lucide-react";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator } from "@/i18n";
import type {
  QueryPlanCopyFormat,
  QueryPlanFinding,
  QueryPlanNode,
} from "@/generated/irodori-api";
import {
  formatMaybe,
  formatMs,
  formatPercent,
  nodeCopyFormat,
} from "./plan-format";

type PlanNodeDetailProps = {
  node: QueryPlanNode;
  findings: QueryPlanFinding[];
  onCopyFormat: (format: QueryPlanCopyFormat) => void;
};

export function PlanNodeDetail({
  node,
  findings,
  onCopyFormat,
}: PlanNodeDetailProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const rows: Array<[string, string]> = [
    [t("plan.column.operation"), node.operation],
    [t("plan.column.object"), node.object ?? ""],
    [t("plan.detail.estimatedRows"), formatMaybe(node.estimatedRows)],
    [t("plan.detail.actualRows"), formatMaybe(node.actualRows)],
    [t("plan.detail.startupCost"), formatMaybe(node.startupCost)],
    [t("plan.detail.totalCost"), formatMaybe(node.totalCost)],
    [t("plan.detail.startupTime"), formatMs(node.actualStartupMs)],
    [t("plan.detail.totalTime"), formatMs(node.actualTotalMs)],
    [t("plan.detail.loops"), formatMaybe(node.loops)],
    [t("plan.detail.width"), formatMaybe(node.width)],
    [t("plan.column.impact"), formatPercent(node.impactScore)],
  ];
  const visibleRows = rows.filter(([, value]) => value !== "");

  return (
    <aside className="plan-node-detail" aria-label={t("plan.selectedNode")}>
      <div className="plan-node-detail-header">
        <div>
          <strong>{node.operation}</strong>
          <span>{node.object ?? node.label}</span>
        </div>
        <button
          type="button"
          title={t("plan.copySelectedNode")}
          onClick={() => onCopyFormat(nodeCopyFormat(node, findings))}
        >
          <Copy size={13} />
        </button>
      </div>

      <dl className="plan-node-kv">
        {visibleRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {findings.length > 0 ? (
        <div className="plan-node-block">
          <strong>{t("plan.findings")}</strong>
          {findings.map((finding, index) => (
            <span
              className={`plan-node-finding ${finding.severity}`}
              key={`${finding.title}:${index}`}
            >
              {finding.title}: {finding.action}
            </span>
          ))}
        </div>
      ) : null}

      {node.notes && node.notes.length > 0 ? (
        <div className="plan-node-block">
          <strong>{t("plan.notes")}</strong>
          {node.notes.map((note, index) => (
            <span key={`${note}:${index}`}>{note}</span>
          ))}
        </div>
      ) : null}

      {node.properties && node.properties.length > 0 ? (
        <div className="plan-node-block">
          <strong>{t("plan.properties")}</strong>
          {node.properties.map((property) => (
            <span key={`${property.name}:${property.value}`}>
              {property.name}: {property.value}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
