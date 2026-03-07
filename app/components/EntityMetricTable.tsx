"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Entity, Metric } from "../types";
import Sparkline from "./Sparkline";
import { formatValue } from "../lib/format";

type EntityMetricTableProps = {
  weeks: string[];
  entities: Entity[];
  metrics: Metric[];
  seriesByEntity: Record<string, Record<string, number[]>>;
  showDelta?: boolean;
  onShowDeltaChange?: (next: boolean) => void;
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
  onShowDeltaChange
}: EntityMetricTableProps) {
  const weekColumnCount = weeks.length;
  const defaultWidths = useMemo(() => [180, 120, 120, ...Array(weekColumnCount).fill(120)], [weekColumnCount]);
  const [columnWidths, setColumnWidths] = useState<number[]>(defaultWidths);
  const resizeIndexRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    setColumnWidths(defaultWidths);
  }, [defaultWidths]);

  const startResize = (index: number, clientX: number) => {
    resizeIndexRef.current = index;
    startXRef.current = clientX;
    startWidthRef.current = columnWidths[index] ?? 120;
  };

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
      <div className="table-scroll">
        <div className="data-grid entity-grid">
          <div className="data-row data-header" style={{ gridTemplateColumns } as CSSProperties}>
            <div className="data-cell data-entity is-resizable">
              엔티티
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize 엔티티 column"
                onMouseDown={(event) => startResize(0, event.clientX)}
              />
            </div>
            <div className="data-cell data-metric is-resizable">
              지표명
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize 지표명 column"
                onMouseDown={(event) => startResize(1, event.clientX)}
              />
            </div>
            <div className="data-cell data-spark is-resizable">
              추이
              <button
                type="button"
                className="col-resizer"
                aria-label="Resize 추이 column"
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
              return (
                <div key={`${entity.id}-${metric.id}`} className="data-row" style={{ gridTemplateColumns } as CSSProperties}>
                  <div className={`data-cell data-entity ${isFirst ? "" : "is-empty"}`}>
                    <span className="name-title">{entity.name}</span>
                  </div>
                  <div className="data-cell data-metric">
                    <span className="name-title">{metric.name}</span>
                  </div>
                  <div className="data-cell data-spark">
                    <Sparkline
                      values={values}
                      labels={weeks}
                      formatValue={(value) => formatValue(value, metric)}
                    />
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
