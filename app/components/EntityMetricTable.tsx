"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  if (!values.length) return "rgba(37, 99, 235, 0.04)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "rgba(37, 99, 235, 0.08)";
  const ratio = (value - min) / (max - min);
  const intensity = 0.04 + ratio * 0.25;
  return `rgba(37, 99, 235, ${intensity})`;
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
  onDrilldownSelect,
  onDrilldownClose
}: EntityMetricTableProps) {
  const weekColumnCount = weeks.length;
  const defaultWidths = useMemo(() => [180, 120, 120, ...Array(weekColumnCount).fill(120)], [weekColumnCount]);
  const [columnWidths, setColumnWidths] = useState<number[]>(defaultWidths);
  const resizeIndexRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [isEntityFilterOpen, setIsEntityFilterOpen] = useState(false);
  const entityFilterRef = useRef<HTMLDivElement | null>(null);
  const drilldownMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setColumnWidths(defaultWidths);
  }, [defaultWidths]);

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
      if (isEntityFilterOpen && entityFilterRef.current && !entityFilterRef.current.contains(event.target as Node)) {
        setIsEntityFilterOpen(false);
      }
      if (expandedEntityName && drilldownMenuRef.current && !drilldownMenuRef.current.contains(event.target as Node)) {
        onDrilldownClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expandedEntityName, isEntityFilterOpen, onDrilldownClose]);

  const startResize = (index: number, clientX: number) => {
    resizeIndexRef.current = index;
    startXRef.current = clientX;
    startWidthRef.current = columnWidths[index] ?? 120;
  };

  const gridTemplateColumns = useMemo(
    () => columnWidths.map((width) => `${Math.round(width)}px`).join(" "),
    [columnWidths]
  );

  return (
    <div className="card table-card">
      <div className="table-head-row">
        <div className="card-title">엔티티별 지표 추이</div>
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
              {index < drilldownPathItems.length - 1 && <span className="drilldown-sep">&gt;</span>}
            </span>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <div className="data-grid entity-grid">
          <div className="data-row data-header" style={{ gridTemplateColumns } as CSSProperties}>
            <div className="data-cell data-entity is-resizable entity-header-cell" ref={entityFilterRef}>
              {onEntityFilterSelect ? (
                <button
                  type="button"
                  className="entity-filter-trigger"
                  onClick={() => setIsEntityFilterOpen((prev) => !prev)}
                >
                  엔티티
                  <svg className="entity-filter-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 6H20L14 13V18L10 20V13L4 6Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : (
                "엔티티"
              )}
              {onEntityFilterSelect && isEntityFilterOpen && (
                <div className="entity-filter-menu">
                  {entityFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`entity-filter-option ${entityFilterValue === option.value ? "is-active" : ""}`}
                      onClick={() => {
                        onEntityFilterSelect(option.value);
                        setIsEntityFilterOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize entity column"
                onMouseDown={(event) => startResize(0, event.clientX)}
              />
            </div>
            <div className="data-cell data-metric is-resizable">
              지표명
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
          {entities.flatMap((entity) => {
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
                        <span className="name-title">{entity.name}</span>
                        {isExpanded && (
                          <div
                            className="entity-drilldown-menu entity-filter-menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {drilldownUnitOptions.length > 0 ? (
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
                    const delta = indexValue < values.length - 1 ? value - values[indexValue + 1] : null;
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
