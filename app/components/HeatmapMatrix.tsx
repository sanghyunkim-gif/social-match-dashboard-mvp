import type { CSSProperties } from "react";
import { Metric } from "../types";
import { getAnomalyIndices, getZScores } from "../lib/anomaly";
import { formatValue } from "../lib/format";
import { InfoPayload } from "./InfoBar";
import MetricTooltip from "./MetricTooltip";

type HeatmapMatrixProps = {
  title: string;
  weeks: string[];
  metrics: Metric[];
  series: Record<string, number[]>;
  onInfoChange?: (info: InfoPayload) => void;
};

const getHeatColor = (value: number, min: number, max: number) => {
  if (max === min) return "rgba(13, 148, 136, 0.2)";
  const ratio = (value - min) / (max - min);
  const intensity = 0.15 + ratio * 0.55;
  return `rgba(13, 148, 136, ${intensity})`;
};

export default function HeatmapMatrix({ title, weeks, metrics, series, onInfoChange }: HeatmapMatrixProps) {
  return (
    <div className="panel heatmap-panel">
      <div className="panel-title">{title}</div>
      <div className="heatmap-table" style={{ "--week-count": weeks.length } as CSSProperties}>
        <div className="heatmap-row heatmap-header">
          <div className="heatmap-cell sticky-left">지표</div>
          {weeks.map((week) => (
            <div key={week} className="heatmap-cell week-cell">
              {week}
            </div>
          ))}
        </div>
        {metrics.map((metric) => {
          const values = series[metric.id] ?? Array(weeks.length).fill(0);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const anomalies = getAnomalyIndices(values);
          const zscores = getZScores(values);
          const lastIndex = values.length - 1;
          const delta = values.length >= 2 ? values[lastIndex] - values[lastIndex - 1] : undefined;

          return (
            <div key={metric.id} className="heatmap-row">
              <div
                className="heatmap-cell sticky-left metric-cell"
                onMouseEnter={() =>
                  onInfoChange?.({
                    metric,
                    value: values[lastIndex],
                    delta,
                    zscore: zscores[lastIndex],
                    isAnomaly: anomalies.includes(lastIndex),
                    week: weeks[lastIndex]
                  })
                }
              >
                <MetricTooltip
                  label={metric.name}
                  title={metric.name}
                  description={metric.description}
                  detail="데이터 원천: Supabase"
                />
              </div>
              {values.map((value, index) => {
                const isAnomaly = anomalies.includes(index);
                const score = zscores[index];
                const detail = `주차: ${weeks[index]} · 증감: ${
                  index > 0 ? formatValue(value - values[index - 1], metric) : "-"
                }`;
                return (
                  <div
                    key={`${metric.id}-${index}`}
                    className={`heatmap-cell value-cell ${isAnomaly ? "is-anomaly" : ""}`}
                    style={{ backgroundColor: getHeatColor(value, min, max) }}
                    onMouseEnter={() =>
                      onInfoChange?.({
                        metric,
                        value,
                        delta: index > 0 ? value - values[index - 1] : undefined,
                        zscore: score,
                        isAnomaly,
                        week: weeks[index]
                      })
                    }
                  >
                    <MetricTooltip
                      label={formatValue(value, metric)}
                      title={metric.name}
                      description={metric.description}
                      detail={detail}
                    />
                    {isAnomaly && (
                      <span className="anomaly-badge" title={`z=${score.toFixed(2)}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10.29 3.86L1.82 18A2 2 0 003.64 21H20.36A2 2 0 0022.18 18L13.71 3.86A2 2 0 0010.29 3.86Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
