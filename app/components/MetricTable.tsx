"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  if (!values.length) return "rgba(108, 171, 221, 0.04)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "rgba(108, 171, 221, 0.08)";
  const ratio = (value - min) / (max - min);
  const intensity = 0.04 + ratio * 0.25;
  return `rgba(108, 171, 221, ${intensity})`;
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
  const colCount = 2 + weekColumnCount;
  const [columnWidths, setColumnWidths] = useState<number[]>([180, 100, ...Array(weekColumnCount).fill(100)]);
  const resizeIndexRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const manualResized = useRef(new Set<number>());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setColumnWidths([180, 100, ...Array(weekColumnCount).fill(100)]);
    manualResized.current.clear();
  }, [weekColumnCount]);

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
  }, [weeks, metrics, series, showDelta, colCount]);

  const startResize = (index: number, clientX: number) => {
    resizeIndexRef.current = index;
    startXRef.current = clientX;
    startWidthRef.current = columnWidths[index] ?? 100;
    manualResized.current.add(index);
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
    <div className="data-grid" ref={gridRef}>
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
              const delta = index > 0 ? value - values[index - 1] : null;
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
