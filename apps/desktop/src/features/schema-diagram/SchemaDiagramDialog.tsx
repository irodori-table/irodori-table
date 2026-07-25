import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Database,
  Download,
  KeyRound,
  Link2,
  Maximize2,
  Plus,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DialogShell } from "@/components/DialogShell";
import { downloadBlob } from "@/features/erd";
import {
  canvasPointFromPointer,
  diagramCanvasSize,
  diagramTableHeight,
  diagramToCreateSql,
  DIAGRAM_TABLE_WIDTH,
  parseDiagramDocument,
  serializeDiagramDocument,
  type DiagramDocument,
  type DiagramForeignKey,
  type DiagramTable,
} from "./schema-diagram";
import { useSchemaDiagramStore } from "./schema-diagram-store";
import { localizedErrorMessage } from "@/core";
import { usePreferencesStore } from "@/features/preferences";
import { createTranslator, type Translator } from "@/i18n";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

type DiagramEdge = {
  id: string;
  path: string;
};

function computeEdges(document: DiagramDocument): DiagramEdge[] {
  const byId = new Map(document.tables.map((table) => [table.id, table]));
  const edges: DiagramEdge[] = [];
  for (const table of document.tables) {
    for (const foreignKey of table.foreignKeys) {
      const target = byId.get(foreignKey.referencesTableId);
      if (!target) {
        continue;
      }
      const toRight = target.x >= table.x;
      const sx = toRight ? table.x + DIAGRAM_TABLE_WIDTH : table.x;
      const tx = toRight ? target.x : target.x + DIAGRAM_TABLE_WIDTH;
      const sy = table.y + diagramTableHeight(table) / 2;
      const ty = target.y + diagramTableHeight(target) / 2;
      const curve = Math.max(40, Math.abs(tx - sx) * 0.4) * (toRight ? 1 : -1);
      edges.push({
        id: foreignKey.id,
        path: `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`,
      });
    }
  }
  return edges;
}

export function SchemaDiagramDialog({
  onClose,
  onPutSqlInEditor,
  onCopySql,
  onSeedFromDb,
  canSeedFromDb,
}: {
  onClose: () => void;
  onPutSqlInEditor: (sql: string) => void;
  onCopySql: (sql: string) => void;
  onSeedFromDb?: () => void;
  canSeedFromDb: boolean;
}) {
  const document = useSchemaDiagramStore((state) => state.document);
  const selectedTableId = useSchemaDiagramStore(
    (state) => state.selectedTableId,
  );
  const selectTable = useSchemaDiagramStore((state) => state.selectTable);
  const moveTable = useSchemaDiagramStore((state) => state.moveTable);
  const addTable = useSchemaDiagramStore((state) => state.addTable);
  const setDocument = useSchemaDiagramStore((state) => state.setDocument);

  const locale = usePreferencesStore((state) => state.locale);
  const { t } = createTranslator(locale);

  const [zoom, setZoom] = useState(1);
  const [importError, setImportError] = useState<string | null>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    tableId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const size = diagramCanvasSize(document);
  const edges = computeEdges(document);
  const sql = diagramToCreateSql(document);

  function pointToCanvas(clientX: number, clientY: number) {
    const origin = scaleRef.current?.getBoundingClientRect();
    return canvasPointFromPointer(
      clientX,
      clientY,
      { left: origin?.left ?? 0, top: origin?.top ?? 0 },
      zoom,
    );
  }

  function handleHeaderPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    table: DiagramTable,
  ) {
    if (event.button !== 0) {
      return;
    }
    const point = pointToCanvas(event.clientX, event.clientY);
    dragRef.current = {
      tableId: table.id,
      offsetX: point.x - table.x,
      offsetY: point.y - table.y,
    };
    selectTable(table.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleHeaderPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const point = pointToCanvas(event.clientX, event.clientY);
    moveTable(drag.tableId, point.x - drag.offsetX, point.y - drag.offsetY);
  }

  function handleHeaderPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
    }
  }

  function fitToViewport() {
    const stage = scaleRef.current?.parentElement?.parentElement;
    if (!stage) {
      setZoom(1);
      return;
    }
    const ratio = Math.min(
      (stage.clientWidth - 48) / size.width,
      (stage.clientHeight - 48) / size.height,
    );
    setZoom(clampZoom(Number.isFinite(ratio) && ratio > 0 ? ratio : 1));
  }

  function exportJson() {
    void downloadBlob(
      new Blob([serializeDiagramDocument(document)], {
        type: "application/json;charset=utf-8",
      }),
      "irodori-schema-diagram.json",
    );
  }

  async function importJson(file: File) {
    try {
      setDocument(parseDiagramDocument(await file.text()));
      setImportError(null);
    } catch (error) {
      setImportError(localizedErrorMessage(t, error));
    }
  }

  const tableCount = document.tables.length;
  const columnCount = document.tables.reduce(
    (sum, table) => sum + table.columns.length,
    0,
  );

  return (
    <DialogShell
      className="diagram diagram-designer"
      label={t("schemaDiagram.dialogLabel")}
      onClose={onClose}
    >
      <div className="diagram-header">
        <strong>{t("schemaDiagram.title")}</strong>
        <span>
          {t("schemaDiagram.summary", {
            tables: tableCount,
            columns: columnCount,
          })}
        </span>
        <button
          className="text-button"
          type="button"
          title={t("schemaDiagram.addTable")}
          onClick={addTable}
        >
          <Plus size={13} />
          <span>{t("schemaDiagram.table")}</span>
        </button>
        <button
          className="text-button"
          type="button"
          title={t("schemaDiagram.seedFromDb")}
          onClick={onSeedFromDb}
          disabled={!canSeedFromDb}
        >
          <Database size={13} />
          <span>{t("schemaDiagram.fromDb")}</span>
        </button>
        <button
          className="mini-button"
          type="button"
          title={t("erd.zoomOut")}
          aria-label={t("erd.zoomOut")}
          onClick={() => setZoom((current) => clampZoom(current - 0.1))}
        >
          <ZoomOut size={13} />
        </button>
        <span className="diagram-zoom">{Math.round(zoom * 100)}%</span>
        <button
          className="mini-button"
          type="button"
          title={t("erd.zoomIn")}
          aria-label={t("erd.zoomIn")}
          onClick={() => setZoom((current) => clampZoom(current + 0.1))}
        >
          <ZoomIn size={13} />
        </button>
        <button
          className="text-button"
          type="button"
          title={t("schemaDiagram.fitToViewport")}
          onClick={fitToViewport}
        >
          <Maximize2 size={13} />
          <span>{t("schemaDiagram.fit")}</span>
        </button>
        <button
          className="text-button"
          type="button"
          title={t("schemaDiagram.exportJson")}
          onClick={exportJson}
        >
          <Download size={13} />
          <span>{t("schemaDiagram.export")}</span>
        </button>
        <button
          className="text-button"
          type="button"
          title={t("schemaDiagram.importJson")}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={13} />
          <span>{t("schemaDiagram.import")}</span>
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => onCopySql(sql)}
        >
          {t("common.copySql")}
        </button>
        <button
          className="primary-action"
          type="button"
          title={t("schemaDiagram.createDbSqlTitle")}
          onClick={() => onPutSqlInEditor(sql)}
        >
          {t("schemaDiagram.createDbSql")}
        </button>
        <button className="text-button" type="button" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      {importError ? (
        <div className="diagram-designer-error" role="alert">
          {importError}
        </div>
      ) : null}

      <div className="diagram-canvas">
        <div
          className="diagram-stage"
          style={{ width: size.width * zoom, height: size.height * zoom }}
        >
          <div
            ref={scaleRef}
            className="diagram-scale diagram-designer-scale"
            style={{
              transform: `scale(${zoom})`,
              width: size.width,
              height: size.height,
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                selectTable(null);
              }
            }}
          >
            <svg
              className="diagram-designer-edges"
              width={size.width}
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="diagram-designer-arrow"
                  markerHeight="7"
                  markerWidth="9"
                  orient="auto"
                  refX="7"
                  refY="3.5"
                  viewBox="0 0 9 7"
                >
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="currentColor" />
                </marker>
              </defs>
              {edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.path}
                  markerEnd="url(#diagram-designer-arrow)"
                />
              ))}
            </svg>
            {document.tables.map((table) => (
              <DiagramTableCard
                key={table.id}
                t={t}
                table={table}
                tables={document.tables}
                selected={table.id === selectedTableId}
                onHeaderPointerDown={handleHeaderPointerDown}
                onHeaderPointerMove={handleHeaderPointerMove}
                onHeaderPointerUp={handleHeaderPointerUp}
              />
            ))}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void importJson(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </DialogShell>
  );
}

function DiagramTableCard({
  t,
  table,
  tables,
  selected,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
}: {
  t: Translator["t"];
  table: DiagramTable;
  tables: DiagramTable[];
  selected: boolean;
  onHeaderPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    table: DiagramTable,
  ) => void;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onHeaderPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const updateTable = useSchemaDiagramStore((state) => state.updateTable);
  const removeTable = useSchemaDiagramStore((state) => state.removeTable);
  const addColumn = useSchemaDiagramStore((state) => state.addColumn);
  const updateColumn = useSchemaDiagramStore((state) => state.updateColumn);
  const removeColumn = useSchemaDiagramStore((state) => state.removeColumn);
  const addForeignKey = useSchemaDiagramStore((state) => state.addForeignKey);
  const removeForeignKey = useSchemaDiagramStore(
    (state) => state.removeForeignKey,
  );

  return (
    <div
      className={`diagram-designer-table${selected ? " is-selected" : ""}`}
      style={{ left: table.x, top: table.y, width: DIAGRAM_TABLE_WIDTH }}
    >
      <div
        className="diagram-designer-table-header"
        onPointerDown={(event) => onHeaderPointerDown(event, table)}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <input
          aria-label={t("schemaDiagram.tableName")}
          className="diagram-designer-table-name"
          value={table.name}
          onChange={(event) =>
            updateTable(table.id, { name: event.currentTarget.value })
          }
        />
        <button
          className="mini-button"
          type="button"
          aria-label={t("schemaDiagram.removeNamedTable", { name: table.name })}
          title={t("schemaDiagram.removeTable")}
          onClick={() => removeTable(table.id)}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="diagram-designer-columns">
        {table.columns.map((column) => (
          <div className="diagram-designer-column" key={column.id}>
            <button
              className={`diagram-designer-key${column.primaryKey ? " is-on" : ""}`}
              type="button"
              aria-label={t("schemaDiagram.togglePrimaryKey")}
              aria-pressed={column.primaryKey}
              title={t("schemaDiagram.primaryKey")}
              onClick={() =>
                updateColumn(table.id, column.id, {
                  primaryKey: !column.primaryKey,
                })
              }
            >
              <KeyRound size={11} />
            </button>
            <input
              aria-label={t("schemaDiagram.columnName")}
              className="diagram-designer-column-name"
              value={column.name}
              placeholder={t("schemaDiagram.columnPlaceholder")}
              onChange={(event) =>
                updateColumn(table.id, column.id, {
                  name: event.currentTarget.value,
                })
              }
            />
            <input
              aria-label={t("schemaDiagram.columnType")}
              className="diagram-designer-column-type"
              value={column.dataType}
              placeholder={t("schemaDiagram.columnTypePlaceholder")}
              onChange={(event) =>
                updateColumn(table.id, column.id, {
                  dataType: event.currentTarget.value,
                })
              }
            />
            <label className="diagram-designer-flag" title="NOT NULL">
              <input
                type="checkbox"
                checked={!column.nullable}
                aria-label={t("schemaDiagram.notNull")}
                onChange={(event) =>
                  updateColumn(table.id, column.id, {
                    nullable: !event.currentTarget.checked,
                  })
                }
              />
              <span>NN</span>
            </label>
            <button
              className="mini-button"
              type="button"
              aria-label={t("schemaDiagram.removeNamedColumn", {
                name: column.name,
              })}
              title={t("schemaDiagram.removeColumn")}
              onClick={() => removeColumn(table.id, column.id)}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {table.foreignKeys.length > 0 ? (
        <div className="diagram-designer-relations">
          {table.foreignKeys.map((foreignKey) => (
            <DiagramForeignKeyRow
              key={foreignKey.id}
              t={t}
              table={table}
              tables={tables}
              foreignKey={foreignKey}
              onRemove={() => removeForeignKey(table.id, foreignKey.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="diagram-designer-table-actions">
        <button
          className="text-button"
          type="button"
          onClick={() => addColumn(table.id)}
        >
          {t("schemaDiagram.addColumn")}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={tables.length < 2}
          title={
            tables.length < 2
              ? t("schemaDiagram.needSecondTable")
              : t("schemaDiagram.addForeignKey")
          }
          onClick={() => addForeignKey(table.id)}
        >
          <Link2 size={12} />
          <span>FK</span>
        </button>
      </div>
    </div>
  );
}

function DiagramForeignKeyRow({
  t,
  table,
  tables,
  foreignKey,
  onRemove,
}: {
  t: Translator["t"];
  table: DiagramTable;
  tables: DiagramTable[];
  foreignKey: DiagramForeignKey;
  onRemove: () => void;
}) {
  const updateForeignKey = useSchemaDiagramStore(
    (state) => state.updateForeignKey,
  );
  const target = tables.find(
    (item) => item.id === foreignKey.referencesTableId,
  );

  return (
    <div className="diagram-designer-relation">
      <Link2 size={11} />
      <select
        aria-label={t("schemaDiagram.localColumn")}
        value={foreignKey.columns[0] ?? ""}
        onChange={(event) =>
          updateForeignKey(table.id, foreignKey.id, {
            columns: [event.currentTarget.value],
          })
        }
      >
        <option value="">{t("schemaDiagram.columnPlaceholder")}</option>
        {table.columns.map((column) => (
          <option key={column.id} value={column.name}>
            {column.name || t("common.unnamed")}
          </option>
        ))}
      </select>
      <span className="diagram-designer-relation-arrow">→</span>
      <select
        aria-label={t("schemaDiagram.referencedTable")}
        value={foreignKey.referencesTableId}
        onChange={(event) =>
          updateForeignKey(table.id, foreignKey.id, {
            referencesTableId: event.currentTarget.value,
            referencesColumns: [],
          })
        }
      >
        {tables
          .filter((item) => item.id !== table.id)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || t("common.unnamed")}
            </option>
          ))}
      </select>
      <select
        aria-label={t("schemaDiagram.referencedColumn")}
        value={foreignKey.referencesColumns[0] ?? ""}
        onChange={(event) =>
          updateForeignKey(table.id, foreignKey.id, {
            referencesColumns: [event.currentTarget.value],
          })
        }
      >
        <option value="">{t("schemaDiagram.columnPlaceholder")}</option>
        {(target?.columns ?? []).map((column) => (
          <option key={column.id} value={column.name}>
            {column.name || t("common.unnamed")}
          </option>
        ))}
      </select>
      <button
        className="mini-button"
        type="button"
        aria-label={t("schemaDiagram.removeRelationship")}
        title={t("schemaDiagram.removeRelationship")}
        onClick={onRemove}
      >
        <X size={11} />
      </button>
    </div>
  );
}
