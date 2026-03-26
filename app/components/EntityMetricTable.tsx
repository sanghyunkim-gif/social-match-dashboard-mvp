"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Entity, FilterOption, MeasurementUnitOption, Metric } from "../types";
import Sparkline from "./Sparkline";
import { formatValue } from "../lib/format";

type EntityMetricTableProps = {
  weeks: string[];
  entities: Entity[];
  metrics: Metric[];
  seriesByEntity: Record<string, Record<string, number[]>>;
  showDelta?: boolean;
  onShowDeltaChange?: (next: boolean) => void;
  onEntitySelect?: (entityName: string) => void;
  entityFilterOptions?: FilterOption[];
  entityFilterValue?: string;
  onEntityFilterSelect?: (value: string) => void;
  drilldownPathItems?: { label: string; targetIndex: number; isCurrent: boolean }[];
  onDrilldownNavigate?: (targetIndex: number) => void;
  expandedEntityName?: string | null;
  drilldownUnitOptions?: MeasurementUnitOption[];
  isDrilldownOptionsLoading?: boolean;
  onDrilldownSelect?: (value: string) => void;
  onDrilldownClose?: () => void;
};

const formatDelta = (metric: Metric, delta: number | null) => {
  if (delta === null) return "-";
  if (metric.format === "percent") {
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${(delta * 100).toFixed(1)}%p`;
  }
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toLocaleString("ko-KR")}`;
};

const getHeatColor = (values: number[], value: number) => {
  if (!values.length) return "rgba(13, 148, 136, 0.04)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "rgba(13, 148, 136, 0.08)";
  const ratio = (value - min) / (max - min);
  const intensity = 0.04 + ratio * 0.25;
  return `rgba(13, 148, 136, ${intensity})`;
};

export default function EntityMetricTable({
  weeks,
  entities,
  metrics,
  seriesByEntity,
  showDelta = true,
  onShowDeltaChange,
  onEntitySelect,
  entityFilterOptions = [],
  entityFilterValue,
  onEntityFilterSelect,
  drilldownPathItems = [],
  onDrilldownNavigate,
  expandedEntityName,
  drilldownUnitOptions = [],
  isDrilldownOptionsLoading = false,
  onDrilldownSelect,
  onDrilldownClose
}: EntityMetricTableProps) {
  const weekColumnCount = weeks.length;
  const colCount = 3 + weekColumnCount;
  const [columnWidths, setColumnWidths] = useState<number[]>([140, 100, 90, ...Array(weekColumnCount).fill(100)]);
  const resizeIndexRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const manualResized = useRef(new Set<number>());
  const gridRef = useRef<HTMLDivElement>(null);
  const [entitySortOrder, setEntitySortOrder] = useState<"asc" | "desc" | null>(null);
  const drilldownMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setColumnWidths([140, 100, 90, ...Array(weekColumnCount).fill(100)]);
    manualResized.current.clear();
  }, [weekColumnCount]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const index = resizeIndexRef.current;
      if (index === null) return;
      const delta = event.clientX - startXRef.current;
      const nextWidth = Math.max(72, startWidthRef.current + delta);
      setColumnWidths((prev) => prev.map((width, widthIndex) => (widthIndex === index ? nextWidth : width)));
    };
    const handleUp = () => {
      resizeIndexRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expandedEntityName && drilldownMenuRef.current && !drilldownMenuRef.current.contains(event.target as Node)) {
        onDrilldownClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expandedEntityName, onDrilldownClose]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const rows = Array.from(grid.querySelectorAll(".data-row")) as HTMLElement[];
    if (!rows.length) return;
    const maxContentStr = Array(colCount).fill("max-content").join(" ");
    const origStyles = rows.map((r) => r.style.gridTemplateColumns);
    rows.forEach((r) => { r.style.gridTemplateColumns = maxContentStr; });
    const maxW = new Array(colCount).fill(0);
    rows.forEach((r) => {
      for (let i = 0; i < Math.min(r.children.length, colCount); i++) {
        const w = (r.children[i] as HTMLElement).offsetWidth;
        if (w > maxW[i]) maxW[i] = w;
      }
    });
    rows.forEach((r, idx) => { r.style.gridTemplateColumns = origStyles[idx]; });
    setColumnWidths((prev) => {
      const next = maxW.map((w, i) =>
        manualResized.current.has(i) ? (prev[i] ?? w) : Math.max(w, 40)
      );
      if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
      return next;
    });
  }, [weeks, metrics, entities, seriesByEntity, showDelta, colCount]);

  const startResize = (index: number, clientX: number) => {
    resizeIndexRef.current = index;
    startXRef.current = clientX;
    startWidthRef.current = columnWidths[index] ?? 100;
    manualResized.current.add(index);
  };

  const gridTemplateColumns = useMemo(
    () => columnWidths.map((width) => `${Math.round(width)}px`).join(" "),
    [columnWidths]
  );

  const sortedEntities = useMemo(() => {
    if (!entitySortOrder) return entities;
    return [...entities].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "ko-KR");
      return entitySortOrder === "asc" ? cmp : -cmp;
    });
  }, [entities, entitySortOrder]);

  const toggleEntitySort = () => {
    setEntitySortOrder((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
  };

  return (
    <div className="card table-card">
      <div className="table-head-row">
        {onShowDeltaChange && (
          <label className="table-toggle">
            <input
              type="checkbox"
              checked={showDelta}
              onChange={(event) => onShowDeltaChange(event.target.checked)}
            />
            <span>증감 노출</span>
          </label>
        )}
      </div>
      {drilldownPathItems.length > 0 && (
        <div className="drilldown-path" aria-label="드릴다운 경로">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="drilldown-home-icon">
            <path d="M3 12L12 3L21 12" />
            <path d="M5 10V20H19V10" />
          </svg>
          {drilldownPathItems.map((item, index) => (
            <span key={`${item.label}-${index}`} className="drilldown-path-item">
              {item.isCurrent || !onDrilldownNavigate ? (
                <span className={`drilldown-node ${item.isCurrent ? "is-current" : ""}`}>{item.label}</span>
              ) : (
                <button
                  type="button"
                  className="drilldown-node is-link"
                  onClick={() => onDrilldownNavigate(item.targetIndex)}
                >
                  {item.label}
                </button>
              )}
              {index < drilldownPathItems.length - 1 && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="drilldown-sep-icon">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <div className="data-grid entity-grid" ref={gridRef}>
          <div className="data-row data-header" style={{ gridTemplateColumns } as CSSProperties}>
            <div className="data-cell data-entity is-resizable entity-header-cell">
              <button
                type="button"
                className="entity-sort-trigger"
                onClick={toggleEntitySort}
              >
                측정단위
                <svg className="entity-sort-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 5V19"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={entitySortOrder ? 1 : 0.4}
                  />
                  {entitySortOrder === "desc" ? (
                    <path
                      d="M5 12L12 19L19 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="M5 12L12 5L19 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={entitySortOrder === "asc" ? 1 : 0.4}
                    />
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize entity column"
                onMouseDown={(event) => startResize(0, event.clientX)}
              />
            </div>
            <div className="data-cell data-metric is-resizable">
              지표
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize metric column"
                onMouseDown={(event) => startResize(1, event.clientX)}
              />
            </div>
            <div className="data-cell data-spark is-resizable">
              추이
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize spark column"
                onMouseDown={(event) => startResize(2, event.clientX)}
              />
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={week} className="data-cell data-week is-resizable">
                {week}
                <button
                  type="button"
                  className="col-resizer"
                  aria-label={`Resize ${week} column`}
                  onMouseDown={(event) => startResize(3 + weekIndex, event.clientX)}
                />
              </div>
            ))}
          </div>
          {sortedEntities.flatMap((entity) => {
            const series = seriesByEntity[entity.id] ?? {};
            return metrics.map((metric, index) => {
              const values = series[metric.id] ?? Array(weeks.length).fill(0);
              const isFirst = index === 0;
              const isExpanded = isFirst && expandedEntityName === entity.name;

              return (
                <div key={`${entity.id}-${metric.id}`} className="data-row" style={{ gridTemplateColumns } as CSSProperties}>
                  <div
                    className={`data-cell data-entity ${isFirst ? "is-clickable" : "is-empty"} ${isExpanded ? "is-expanded" : ""}`}
                    onClick={isFirst && onEntitySelect ? () => onEntitySelect(entity.name) : undefined}
                    role={isFirst && onEntitySelect ? "button" : undefined}
                    tabIndex={isFirst && onEntitySelect ? 0 : undefined}
                    onKeyDown={
                      isFirst && onEntitySelect
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onEntitySelect(entity.name);
                            }
                          }
                        : undefined
                    }
                  >
                    {isFirst && onEntitySelect ? (
                      <div className="entity-cell-wrap" ref={isExpanded ? drilldownMenuRef : undefined}>
                        <span className="name-title">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="entity-icon">
                            <path d="M20 21V19C20 16.79 18.21 15 16 15H8C5.79 15 4 16.79 4 19V21" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {entity.name}
                        </span>
                        {isExpanded && (
                          <div
                            className="entity-drilldown-menu entity-filter-menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {isDrilldownOptionsLoading ? (
                              <div className="entity-drilldown-empty">드릴다운 옵션 확인 중...</div>
                            ) : drilldownUnitOptions.length > 0 ? (
                              drilldownUnitOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className="entity-filter-option"
                                  onClick={() => onDrilldownSelect?.(option.value)}
                                >
                                  {option.label}
                                </button>
                              ))
                            ) : (
                              <div className="entity-drilldown-empty">선택 가능한 측정단위가 없습니다.</div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="name-title">{entity.name}</span>
                    )}
                  </div>
                  <div className="data-cell data-metric">
                    <span className="name-title">{metric.name}</span>
                  </div>
                  <div className="data-cell data-spark">
                    <Sparkline values={values} labels={weeks} formatValue={(value) => formatValue(value, metric)} />
                  </div>
                  {values.map((value, indexValue) => {
                    const delta = indexValue > 0 ? value - values[indexValue - 1] : null;
                    const deltaLabel = formatDelta(metric, delta);
                    return (
                      <div
                        key={`${entity.id}-${metric.id}-${indexValue}`}
                        className="data-cell data-value"
                        style={{ backgroundColor: getHeatColor(values, value) }}
                      >
                        <span className="value-main">{formatValue(value, metric)}</span>
                        {showDelta && (
                          <span
                            className={`value-delta ${delta !== null ? "has-delta" : ""} ${
                              delta !== null && delta < 0 ? "is-negative" : ""
                            }`}
                          >
                            {delta !== null ? `(${deltaLabel})` : "-"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
