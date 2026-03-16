"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Metric } from "../types";
import { formatValue } from "../lib/format";
import Sparkline from "./Sparkline";

type MetricTableProps = {
  title?: string;
  weeks: string[];
  metrics: Metric[];
  series: Record<string, number[]>;
  primaryMetricId?: string;
  showHeader?: boolean;
  dense?: boolean;
  indent?: boolean;
  scrollable?: boolean;
  embedded?: boolean;
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

export default function MetricTable({
  title,
  weeks,
  metrics,
  series,
  primaryMetricId,
  showHeader = true,
  dense = false,
  indent = false,
  scrollable = true,
  embedded = false,
  showDelta = true,
  onShowDeltaChange
}: MetricTableProps) {
  const weekColumnCount = weeks.length;
  const defaultWidths = useMemo(() => [220, 140, ...Array(weekColumnCount).fill(120)], [weekColumnCount]);
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

  const grid = (
    <div className="data-grid">
      {showHeader && (
        <div className="data-row data-header" style={{ gridTemplateColumns } as CSSProperties}>
          <div className="data-cell data-name is-resizable">
            지표
            <button
              type="button"
              className="col-resizer"
              aria-label="Resize 지표 column"
              onMouseDown={(event) => startResize(0, event.clientX)}
            />
          </div>
          <div className="data-cell data-spark is-resizable">
            추이
            <button
              type="button"
              className="col-resizer"
              aria-label="Resize 추이 column"
              onMouseDown={(event) => startResize(1, event.clientX)}
            />
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={week} className="data-cell data-week is-resizable">
              {week}
              <button
                type="button"
                className="col-resizer"
                aria-label={`Resize ${week} column`}
                onMouseDown={(event) => startResize(2 + weekIndex, event.clientX)}
              />
            </div>
          ))}
        </div>
      )}
      {metrics.map((metric) => {
        const values = series[metric.id] ?? Array(weeks.length).fill(0);
        return (
          <div
            key={metric.id}
            className={`data-row ${metric.id === primaryMetricId ? "is-primary" : ""}`}
            style={{ gridTemplateColumns } as CSSProperties}
          >
            <div className="data-cell data-name">
              <span className="name-title">{metric.name}</span>
            </div>
            <div className="data-cell data-spark">
              <Sparkline values={values} labels={weeks} formatValue={(value) => formatValue(value, metric)} />
            </div>
            {values.map((value, index) => {
              const delta = index < values.length - 1 ? value - values[index + 1] : null;
              const deltaLabel = formatDelta(metric, delta);
              return (
                <div
                  key={`${metric.id}-${index}`}
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
      })}
    </div>
  );

  const wrapperClass = `${embedded ? "table-embedded" : "card"} table-card ${dense ? "is-dense" : ""} ${
    indent ? "is-indent" : ""
  }`.trim();

  return (
    <div className={wrapperClass}>
      {(title || onShowDeltaChange) && (
        <div className="table-head-row">
          {title ? <div className="card-title">{title}</div> : <div />}
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
      )}
      {scrollable ? <div className="table-scroll">{grid}</div> : grid}
    </div>
  );
}
