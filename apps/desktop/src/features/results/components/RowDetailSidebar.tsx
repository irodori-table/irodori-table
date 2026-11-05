import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Copy, MoreHorizontal, Search } from "lucide-react";
import { CloseButton } from "@/components/CloseButton";
import {
  popoverSurfaceStyle,
  useAnchoredMenu,
  type PopoverRect,
} from "@/components/popover";
import { errorMessage } from "@/core";

import { writeTextToClipboard } from "@/features/erd";
import { usePreferencesStore } from "@/features/preferences";
import {
  dbRunQuery,
  type DatabaseMetadata,
  type DbEngine,
  type DbObjectMetadata,
  type ForeignKey,
} from "@/generated/irodori-api";
import {
  buildJsonTree,
  buildForeignKeyLookup,
  detailCopyText,
  findTableByName,
  foreignKeyColumns,
  formatRowAsJson,
  formatDetailValue,
  rowToJsonObject,
  type JsonTreeNode,
} from "../row-detail";
import { createTranslator, type Translator } from "@/i18n";

const MAX_FK_DEPTH = 6;
/** How long a field's copy button shows its copied/failed state. */
const FIELD_COPY_STATUS_MS = 1500;

type DetailMode = "fields" | "json" | "tree";

const DETAIL_MODES: Array<{ id: DetailMode }> = [
  { id: "fields" },
  { id: "json" },
  { id: "tree" },
];

const detailModeLabelKeys: Record<DetailMode, Parameters<Translator["t"]>[0]> =
  {
    fields: "rowDetail.mode.fields",
    json: "rowDetail.mode.json",
    tree: "rowDetail.mode.tree",
  };

const emptyRowValues: readonly unknown[] = [];

type RowDetailSidebarProps = {
  columns: string[];
  values: readonly unknown[] | null;
  /** Metadata for the table the row came from (null when the source is ambiguous). */
  table: DbObjectMetadata | null;
  metadata: DatabaseMetadata | undefined;
  engine: DbEngine;
  connectionId: string;
  onClose: () => void;
};

/** A right-side drawer showing one result row's columns, JSON values, and FK links. */
export function RowDetailSidebar(props: RowDetailSidebarProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const [mode, setMode] = useState<DetailMode>("fields");
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const rowSelected = props.values !== null;
  const values = props.values ?? emptyRowValues;
  // A tree of flat values adds nothing to the field list, so it is only offered
  // when a value has structure to walk.
  const hasStructuredValue = useMemo(
    () => values.some((value) => formatDetailValue(value).json),
    [values],
  );
  const modes = useMemo(
    () =>
      DETAIL_MODES.filter((item) => item.id !== "tree" || hasStructuredValue),
    [hasStructuredValue],
  );
  const activeMode = mode === "tree" && !hasStructuredValue ? "fields" : mode;
  const rowJson = useMemo(
    () => (rowSelected ? formatRowAsJson(props.columns, values) : ""),
    [props.columns, rowSelected, values],
  );
  const rowObject = useMemo(
    () => (rowSelected ? rowToJsonObject(props.columns, values) : null),
    [props.columns, rowSelected, values],
  );

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }
    const timer = window.setTimeout(
      () => setCopyStatus("idle"),
      FIELD_COPY_STATUS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const copyLabel =
    copyStatus === "copied"
      ? t("rowDetail.copied")
      : copyStatus === "failed"
        ? t("rowDetail.failed")
        : t("rowDetail.copyJson");

  async function copyJson() {
    if (!rowSelected) {
      return;
    }
    try {
      await navigator.clipboard.writeText(rowJson);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <aside className="row-detail" aria-label={t("rowDetail.label")}>
      <div className="row-detail-header">
        <div className="row-detail-title">
          <span>{t("rowDetail.title")}</span>
          <span>
            {rowSelected
              ? t("rowDetail.fieldsCount", { count: props.columns.length })
              : t("rowDetail.noRowSelected")}
          </span>
        </div>
        {/* Always enabled: `onClose` dismisses the panel as well as clearing
            the selection, so gating it on a selected row left the panel with
            no way out once it was opened without one. */}
        <CloseButton
          onClose={props.onClose}
          label={t("rowDetail.close")}
          className="row-detail-close"
        />
      </div>
      <div className="row-detail-controls">
        <RowDetailModeTabs
          modes={modes.map((item) => item.id)}
          active={activeMode}
          onSelect={setMode}
          t={t}
        />
        <button
          type="button"
          className={`row-detail-copy${copyStatus !== "idle" ? " is-status" : ""}`}
          onClick={copyJson}
          title={copyLabel}
          aria-label={copyLabel}
          disabled={!rowSelected}
        >
          {copyStatus === "copied" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
        </button>
        <label className="row-detail-search">
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCopyStatus("idle");
            }}
            placeholder={t("rowDetail.search")}
            aria-label={t("rowDetail.search")}
            disabled={!rowSelected}
          />
        </label>
      </div>
      <div className="row-detail-body">
        {!rowSelected ? (
          <div className="row-detail-empty">{t("rowDetail.noRowSelected")}</div>
        ) : activeMode === "fields" ? (
          <RowDetailFields
            columns={props.columns}
            values={values}
            table={props.table}
            metadata={props.metadata}
            engine={props.engine}
            connectionId={props.connectionId}
            depth={0}
            filter={query}
            t={t}
          />
        ) : activeMode === "json" ? (
          <RowJsonDocument text={rowJson} filter={query} t={t} />
        ) : (
          <JsonTreeView value={rowObject} filter={query} t={t} />
        )}
      </div>
    </aside>
  );
}

/**
 * The view switcher. When the labels do not fit the panel, only the active view
 * keeps a tab and the others move into a menu, rather than the text overlapping.
 */
function RowDetailModeTabs({
  modes,
  active,
  onSelect,
  t,
}: {
  modes: DetailMode[];
  active: DetailMode;
  onSelect: (mode: DetailMode) => void;
  t: Translator["t"];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fullWidthRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<PopoverRect | null>(null);
  const closeMenu = () => setMenuAnchor(null);
  const menu = useAnchoredMenu<HTMLDivElement>(
    menuAnchor
      ? { at: "element", rect: menuAnchor, side: "below", align: "end" }
      : null,
    closeMenu,
  );
  const labels = modes.map((mode) => t(detailModeLabelKeys[mode]));
  const labelsKey = labels.join("|");

  // Measured from a hidden copy of the full row, so it holds in every locale.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const fullWidth = fullWidthRef.current;
    if (!host || !fullWidth) {
      return;
    }
    const measure = () =>
      setCollapsed(
        host.clientWidth > 0 && fullWidth.offsetWidth > host.clientWidth,
      );
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [labelsKey]);

  const tabs = collapsed ? modes.filter((mode) => mode === active) : modes;
  const others = modes.filter((mode) => mode !== active);
  return (
    <div className="row-detail-tabs-host" ref={hostRef}>
      <div
        className="row-detail-tabs row-detail-tabs-full-width"
        ref={fullWidthRef}
        aria-hidden="true"
      >
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div
        className="row-detail-tabs"
        role="tablist"
        aria-label={t("rowDetail.view")}
      >
        {tabs.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={mode === active}
            className={mode === active ? "is-active" : undefined}
            onClick={() => onSelect(mode)}
          >
            {t(detailModeLabelKeys[mode])}
          </button>
        ))}
      </div>
      {collapsed ? (
        <button
          type="button"
          className="row-detail-more"
          title={t("rowDetail.moreViews")}
          aria-label={t("rowDetail.moreViews")}
          aria-haspopup="menu"
          aria-expanded={menuAnchor !== null}
          onClick={(event) => {
            setMenuAnchor(
              menuAnchor ? null : event.currentTarget.getBoundingClientRect(),
            );
          }}
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      ) : null}
      {menuAnchor
        ? createPortal(
            <div
              ref={menu.ref}
              className="object-action-menu"
              role="menu"
              style={{ ...popoverSurfaceStyle, ...menu.style }}
            >
              {others.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(mode);
                    closeMenu();
                  }}
                >
                  {t(detailModeLabelKeys[mode])}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type RowDetailFieldsProps = {
  columns: string[];
  values: readonly unknown[];
  table: DbObjectMetadata | null;
  metadata: DatabaseMetadata | undefined;
  engine: DbEngine;
  connectionId: string;
  depth: number;
  filter: string;
  t: Translator["t"];
};

type ReferencedRow = {
  columns: string[];
  values: unknown[];
  table: DbObjectMetadata | null;
};

function RowDetailFields(props: RowDetailFieldsProps) {
  const {
    columns,
    values,
    table,
    metadata,
    engine,
    connectionId,
    depth,
    filter,
    t,
  } = props;

  const fkColumns = useMemo(
    () => foreignKeyColumns(table, columns),
    [table, columns],
  );
  const typeByColumn = useMemo(() => {
    const map = new Map<string, string>();
    for (const column of table?.columns ?? []) {
      map.set(column.name.toLowerCase(), column.dataType);
    }
    return map;
  }, [table]);

  const [openColumn, setOpenColumn] = useState<number | null>(null);
  const [referenced, setReferenced] = useState<ReferencedRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldCopy, setFieldCopy] = useState<{
    index: number;
    status: "copied" | "failed";
  } | null>(null);
  const normalizedFilter = filter.trim().toLowerCase();

  // A fresh object per copy restarts the timer, so repeat clicks on the same
  // field keep the check visible for the full interval.
  useEffect(() => {
    if (!fieldCopy) {
      return;
    }
    const timer = window.setTimeout(
      () => setFieldCopy(null),
      FIELD_COPY_STATUS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [fieldCopy]);

  async function copyField(index: number) {
    try {
      await writeTextToClipboard(detailCopyText(values[index]));
      setFieldCopy({ index, status: "copied" });
    } catch {
      setFieldCopy({ index, status: "failed" });
    }
  }

  async function navigate(
    columnIndex: number,
    fk: ForeignKey,
    columnIndexes: number[],
  ) {
    if (openColumn === columnIndex) {
      setOpenColumn(null);
      setReferenced(null);
      setError(null);
      return;
    }
    const keyValues = columnIndexes.map((index) => values[index]);
    if (keyValues.some((value) => value === null || value === undefined)) {
      return;
    }
    setOpenColumn(columnIndex);
    setReferenced(null);
    setError(null);
    setLoading(true);
    try {
      const lookup = buildForeignKeyLookup(fk, keyValues, engine);
      const result = await dbRunQuery(
        connectionId,
        lookup.sql,
        1,
        undefined,
        undefined,
        lookup.params,
      );
      if (result.rows.length === 0) {
        setError(
          t("rowDetail.noMatchingReferencedRow", {
            table: fk.referencesTable,
          }),
        );
        return;
      }
      setReferenced({
        columns: result.columns,
        values: result.rows[0],
        table: findTableByName(
          metadata,
          fk.referencesSchema,
          fk.referencesTable,
        ),
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const rows = columns
    .map((column, index) => {
      const detail = formatDetailValue(values[index]);
      const dataType = typeByColumn.get(column.toLowerCase());
      return { column, index, detail, dataType };
    })
    .filter(({ column, detail, dataType }) =>
      matchesDetailFilter(normalizedFilter, column, dataType, detail.text),
    );

  if (rows.length === 0) {
    return (
      <div className="detail-empty">{t("rowDetail.noMatchingFields")}</div>
    );
  }

  return (
    <dl className="detail-list">
      {rows.map(({ column, index, detail, dataType }) => {
        const binding = fkColumns.get(index);
        const navigable = binding !== undefined && depth < MAX_FK_DEPTH;
        const open = navigable && openColumn === index;
        const copyStatus = fieldCopy?.index === index ? fieldCopy.status : null;
        const copyLabel = t("rowDetail.copyField", { name: column });
        return (
          <div className="detail-row" key={`${column}-${index}`}>
            <dt className="detail-key">
              <span className="detail-col" title={column}>
                {column}
              </span>
              {dataType ? (
                <span className="detail-type" title={dataType}>
                  {dataType}
                </span>
              ) : null}
              <button
                type="button"
                className={`detail-copy${copyStatus ? ` is-${copyStatus}` : ""}`}
                onClick={() => void copyField(index)}
                aria-label={copyLabel}
                title={
                  copyStatus === "copied"
                    ? t("rowDetail.copied")
                    : copyStatus === "failed"
                      ? t("rowDetail.failed")
                      : copyLabel
                }
              >
                {copyStatus === "copied" ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <Copy size={12} aria-hidden="true" />
                )}
              </button>
            </dt>
            <dd className="detail-value">
              {navigable ? (
                <button
                  type="button"
                  className={`fk-link${open ? " is-open" : ""}`}
                  onClick={() =>
                    navigate(index, binding.fk, binding.columnIndexes)
                  }
                  title={t("rowDetail.referencesTable", {
                    table: binding.fk.referencesTable,
                  })}
                >
                  <ArrowRight size={12} aria-hidden="true" />
                  <span>{detail.text}</span>
                </button>
              ) : detail.json ? (
                <pre className="detail-json">{detail.text}</pre>
              ) : (
                <span
                  className={values[index] === null ? "detail-null" : undefined}
                >
                  {detail.text}
                </span>
              )}
              {open ? (
                <div className="detail-ref">
                  {loading ? (
                    <span className="detail-ref-status">
                      {t("rowDetail.loadingTable", {
                        table: binding.fk.referencesTable,
                      })}
                    </span>
                  ) : null}
                  {error ? (
                    <span className="detail-ref-error">{error}</span>
                  ) : null}
                  {referenced ? (
                    <>
                      <div className="detail-ref-head">
                        → {binding.fk.referencesTable}
                      </div>
                      <RowDetailFields
                        columns={referenced.columns}
                        values={referenced.values}
                        table={referenced.table}
                        metadata={metadata}
                        engine={engine}
                        connectionId={connectionId}
                        depth={depth + 1}
                        filter={filter}
                        t={t}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function matchesDetailFilter(
  normalizedFilter: string,
  column: string,
  dataType: string | undefined,
  value: string,
): boolean {
  if (normalizedFilter.length === 0) {
    return true;
  }
  return `${column} ${dataType ?? ""} ${value}`
    .toLowerCase()
    .includes(normalizedFilter);
}

function RowJsonDocument({
  text,
  filter,
  t,
}: {
  text: string;
  filter: string;
  t: Translator["t"];
}) {
  const normalizedFilter = filter.trim().toLowerCase();
  const matches =
    normalizedFilter.length === 0 ||
    text.toLowerCase().includes(normalizedFilter);
  return (
    <div className="row-json-view">
      {normalizedFilter.length > 0 ? (
        <div className={`detail-filter-status${matches ? "" : " is-empty"}`}>
          {matches ? t("rowDetail.jsonMatches") : t("rowDetail.noJsonMatch")}
        </div>
      ) : null}
      <pre
        className={`detail-json detail-json-full${matches ? "" : " is-dimmed"}`}
      >
        {text}
      </pre>
    </div>
  );
}

function JsonTreeView({
  value,
  filter,
  t,
}: {
  value: unknown;
  filter: string;
  t: Translator["t"];
}) {
  const tree = useMemo(() => buildJsonTree(value), [value]);
  const normalizedFilter = filter.trim().toLowerCase();
  const matches = nodeMatchesFilter(tree, normalizedFilter);
  if (!matches) {
    return <div className="detail-empty">{t("rowDetail.noJsonPaths")}</div>;
  }
  return (
    <div className="json-tree">
      <JsonTreeNodeView node={tree} filter={normalizedFilter} root />
    </div>
  );
}

function JsonTreeNodeView({
  node,
  filter,
  root = false,
}: {
  node: JsonTreeNode;
  filter: string;
  root?: boolean;
}) {
  const visibleChildren = node.children.filter((child) =>
    nodeMatchesFilter(child, filter),
  );
  const label = root ? "$" : node.key;

  if (node.children.length > 0) {
    return (
      <details className="json-tree-node" open>
        <summary className="json-tree-summary">
          <span className="json-tree-key">{label}</span>
          <span className="json-tree-type">{node.type}</span>
          <span className="json-tree-preview">{node.preview}</span>
        </summary>
        <div className="json-tree-children">
          {visibleChildren.map((child) => (
            <JsonTreeNodeView key={child.path} node={child} filter={filter} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="json-tree-leaf">
      <span className="json-tree-key">{label}</span>
      <span className="json-tree-type">{node.type}</span>
      <span className="json-tree-preview">{node.preview}</span>
    </div>
  );
}

function nodeMatchesFilter(
  node: JsonTreeNode,
  normalizedFilter: string,
): boolean {
  if (normalizedFilter.length === 0) {
    return true;
  }
  const selfMatches = `${node.key} ${node.path} ${node.type} ${node.preview}`
    .toLowerCase()
    .includes(normalizedFilter);
  return (
    selfMatches ||
    node.children.some((child) => nodeMatchesFilter(child, normalizedFilter))
  );
}
