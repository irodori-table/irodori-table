import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Cloud, Copy, Database, FileText, Play, Wrench, X } from "lucide-react";
import type { DatabaseMetadata, DbEngine } from "@/generated/irodori-api";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type TranslationKey } from "@/i18n";

type LakehousePanelProps = {
  editorEngine: DbEngine;
  activeConnectionName: string;
  activeConnectionOpen: boolean;
  activeMetadata: DatabaseMetadata | undefined;
  onInsertSql: (sql: string) => void;
  onLoadSql: (sql: string) => void;
  onClose: () => void;
};

type LakehouseAction = {
  id: string;
  /** Resolved by the component, so the list follows the app language (#170). */
  titleKey: TranslationKey;
  detailKey: TranslationKey;
  sql: string;
};

const duckdbIcebergSql = `INSTALL httpfs;
INSTALL iceberg;

LOAD httpfs;
LOAD iceberg;

CREATE SECRET IF NOT EXISTS irodori_s3 (
  TYPE s3,
  PROVIDER credential_chain
);

SELECT *
FROM iceberg_scan('s3://bucket/path/to/table/metadata/00000.metadata.json')
LIMIT 100;`;

const restCatalogSql = `INSTALL iceberg;
LOAD iceberg;

CREATE SECRET IF NOT EXISTS irodori_iceberg (
  TYPE iceberg,
  CLIENT_ID 'client-id',
  CLIENT_SECRET 'client-secret',
  ENDPOINT 'https://catalog.example.com/api/catalog',
  AWS_REGION 'us-east-1'
);

ATTACH 'catalog_name' AS lakehouse (TYPE iceberg);

SHOW ALL TABLES;

SELECT *
FROM lakehouse.namespace.table_name
LIMIT 100;`;

const motherDuckSql = `INSTALL motherduck;
LOAD motherduck;

ATTACH 'md:' AS md;

SHOW ALL TABLES;

SELECT *
FROM md.database_name.schema_name.table_name
LIMIT 100;`;

const athenaSql = `-- Athena profile fields:
-- Region: us-east-1
-- Catalog/database: AwsDataCatalog/default
-- Workgroup: primary
-- Output: s3://bucket/query-results/

SELECT *
FROM "database_name"."table_name"
LIMIT 100;`;

const maintenanceSql = `-- Run after selecting an Iceberg table and verifying retention policy.
-- DuckDB executes reads locally; catalog-backed maintenance may require Athena,
-- Spark, Trino, or a REST catalog maintenance service.

SELECT *
FROM lakehouse.namespace.table_name
LIMIT 100;

-- Common maintenance commands by engine:
-- OPTIMIZE table_name;
-- VACUUM table_name;
-- ALTER TABLE table_name EXECUTE expire_snapshots(retention_threshold => '7d');`;

function lakehouseActions(engine: DbEngine): LakehouseAction[] {
  const actions: LakehouseAction[] = [
    {
      id: "duckdb-iceberg",
      titleKey: "lakehouse.action.duckdbIceberg.title",
      detailKey: "lakehouse.action.duckdbIceberg.detail",
      sql: duckdbIcebergSql,
    },
    {
      id: "iceberg-rest",
      titleKey: "lakehouse.action.icebergRest.title",
      detailKey: "lakehouse.action.icebergRest.detail",
      sql: restCatalogSql,
    },
    {
      id: "motherduck",
      titleKey: "lakehouse.action.motherduck.title",
      detailKey: "lakehouse.action.motherduck.detail",
      sql: motherDuckSql,
    },
    {
      id: "athena",
      titleKey: "lakehouse.action.athena.title",
      detailKey: "lakehouse.action.athena.detail",
      sql: athenaSql,
    },
    {
      id: "maintenance",
      titleKey: "lakehouse.action.maintenance.title",
      detailKey: "lakehouse.action.maintenance.detail",
      sql: maintenanceSql,
    },
  ];

  if (engine === "motherduck") {
    return [actions[2], actions[0], actions[1], actions[4], actions[3]];
  }
  if (engine === "athena") {
    return [actions[3], actions[1], actions[4], actions[0], actions[2]];
  }
  if (engine === "iceberg" || engine === "s3Tables") {
    return [actions[0], actions[1], actions[4], actions[3], actions[2]];
  }
  return actions;
}

export function isLakehouseEngine(engine: DbEngine) {
  return [
    "databricks",
    "athena",
    "duckdb",
    "motherduck",
    "hive",
    "iceberg",
    "s3Tables",
    "deltaLake",
    "hudi",
  ].includes(engine);
}

export function LakehousePanel({
  editorEngine,
  activeConnectionName,
  activeConnectionOpen,
  activeMetadata,
  onInsertSql,
  onLoadSql,
  onClose,
}: LakehousePanelProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);
  const actions = useMemo(() => lakehouseActions(editorEngine), [editorEngine]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    action: LakehouseAction;
  } | null>(null);
  const tableCount =
    activeMetadata?.schemas.reduce(
      (count, schema) =>
        count +
        schema.objects.filter(
          (object) => object.kind === "table" || object.kind === "view",
        ).length,
      0,
    ) ?? 0;
  const lakehouseEngine = isLakehouseEngine(editorEngine);
  const contextAction = contextMenu?.action;
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }
    const close = () => setContextMenu(null);
    // The menu is portaled to <body>, outside the React root, so a pointerdown
    // inside it reaches this document listener without React's stopPropagation
    // ever running — guard by containment instead, as EditorContextMenu does.
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    setContextMenu(null);
  }, [editorEngine]);

  const openContextMenu = (
    event: ReactMouseEvent,
    action: LakehouseAction = actions[0],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      ...clampLakehouseMenuPosition(event.clientX, event.clientY),
      action,
    });
  };

  const loadSql = (sql: string) => {
    onLoadSql(sql);
    setContextMenu(null);
  };

  const insertSql = (sql: string) => {
    onInsertSql(`\n${sql}\n`);
    setContextMenu(null);
  };

  const copySql = (sql: string) => {
    void navigator.clipboard?.writeText(sql);
    setContextMenu(null);
  };

  return (
    <section
      className="lakehouse-panel"
      aria-label={t("lakehouse.panelLabel")}
      onContextMenu={(event) => openContextMenu(event)}
    >
      <div className="lakehouse-header">
        <div>
          <strong>{t("lakehouse.title")}</strong>
          <span>
            {activeConnectionName} · {editorEngine}
          </span>
        </div>
        <button
          type="button"
          title={t("lakehouse.close")}
          aria-label={t("lakehouse.close")}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="lakehouse-status">
        <div>
          <Database size={15} />
          <span>
            {activeConnectionOpen
              ? t("lakehouse.connected")
              : t("lakehouse.notConnected")}
          </span>
        </div>
        <div>
          <FileText size={15} />
          <span>
            {tableCount
              ? t("lakehouse.objectCount", { count: tableCount })
              : t("lakehouse.noCatalog")}
          </span>
        </div>
      </div>

      {!lakehouseEngine ? (
        <div className="lakehouse-callout">
          <Cloud size={16} />
          <span>{t("lakehouse.switchEngine")}</span>
        </div>
      ) : null}

      <div className="lakehouse-action-list">
        {actions.map((action) => (
          <article
            className="lakehouse-action"
            key={action.id}
            onContextMenu={(event) => openContextMenu(event, action)}
          >
            <div>
              <strong>{t(action.titleKey)}</strong>
              <span>{t(action.detailKey)}</span>
            </div>
            <div className="lakehouse-action-buttons">
              <button
                type="button"
                title={t("lakehouse.loadNamedSql", {
                  name: t(action.titleKey),
                })}
                onClick={() => loadSql(action.sql)}
              >
                <Play size={14} />
                <span>{t("lakehouse.load")}</span>
              </button>
              <button
                type="button"
                title={t("lakehouse.insertNamedSql", {
                  name: t(action.titleKey),
                })}
                onClick={() => insertSql(action.sql)}
              >
                <Wrench size={14} />
                <span>{t("lakehouse.insert")}</span>
              </button>
              <button
                type="button"
                title={t("lakehouse.copyNamedSql", {
                  name: t(action.titleKey),
                })}
                aria-label={t("lakehouse.copyNamedSql", {
                  name: t(action.titleKey),
                })}
                onClick={() => copySql(action.sql)}
              >
                <Copy size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {activeMetadata?.schemas.length ? (
        <div className="lakehouse-catalog">
          <strong>{t("lakehouse.catalog")}</strong>
          {activeMetadata.schemas.slice(0, 6).map((schema) => (
            <div className="lakehouse-catalog-row" key={schema.name}>
              <span>{schema.name}</span>
              <small>{schema.objects.length}</small>
            </div>
          ))}
        </div>
      ) : null}

      {/*
        Portaled to <body>: dockview's .dv-render-overlay ancestor sets
        transform/contain/will-change, becoming the containing block for fixed
        descendants. Rendered inline, the menu's viewport coordinates resolved
        against the dock panel — the clamp ran first, in viewport space, and
        the dock offset landed after it, putting the menu at x=2654 on a
        1600px-wide window (#124). Same fix as the tab menu in #115.
      */}
      {contextAction
        ? createPortal(
            <div
              ref={contextMenuRef}
              className="app-menu-popover lakehouse-context-menu"
              role="menu"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => loadSql(contextAction.sql)}
              >
                <span>
                  {t("lakehouse.loadNamedSql", {
                    name: t(contextAction.titleKey),
                  })}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => insertSql(contextAction.sql)}
              >
                <span>
                  {t("lakehouse.insertNamedSql", {
                    name: t(contextAction.titleKey),
                  })}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => copySql(contextAction.sql)}
              >
                <span>
                  {t("lakehouse.copyNamedSql", {
                    name: t(contextAction.titleKey),
                  })}
                </span>
              </button>
              <span className="menu-separator" aria-hidden="true" />
              <button type="button" role="menuitem" onClick={onClose}>
                <span>{t("lakehouse.close")}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function clampLakehouseMenuPosition(x: number, y: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }
  const menuWidth = 238;
  const menuHeight = 136;
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
  };
}
