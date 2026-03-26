import { Metric } from "../types";
import { formatValue } from "../lib/format";
import MetricTooltip from "./MetricTooltip";

type MainTrendChartProps = {
  metric: Metric;
  weeks: string[];
  values: number[];
};

const buildPath = (values: number[], width: number, height: number) => {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

export default function MainTrendChart({ metric, weeks, values }: MainTrendChartProps) {
  if (values.length === 0) {
    return (
      <div className="panel main-chart">
        <div className="panel-title">{metric.name}</div>
        <div className="empty-state">그래프 데이터를 준비 중입니다.</div>
      </div>
    );
  }

  const path = buildPath(values, 520, 120);
  const latest = values[values.length - 1];
  const previous = values[values.length - 2];
  const delta = latest !== undefined && previous !== undefined ? latest - previous : 0;

  return (
    <div className="panel main-chart">
      <div className="panel-title">
        {/* 메인 그래프 지표명도 metric_store_native 설명을 tooltip으로 연결 */}
        <MetricTooltip
          label={metric.name}
          title={metric.name}
          description={metric.description}
          detail="기준시점: 주간"
        />
      </div>
      <div className="chart-meta">
        <span>최근 값: {latest !== undefined ? formatValue(latest, metric) : "-"}</span>
        <span>전주 대비: {delta >= 0 ? "+" : ""}{formatValue(delta, metric)}</span>
        <span>기간: {weeks[0]} ~ {weeks[weeks.length - 1]}</span>
      </div>
      <svg viewBox="0 0 520 120" className="chart-svg" role="img" aria-label={metric.name}>
        <path d={path} fill="none" stroke="#1C2C5B" strokeWidth="2" />
        {values.map((value, index) => {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min || 1;
          const x = (index / (values.length - 1 || 1)) * 520;
          const y = 120 - ((value - min) / range) * 120;
          return <circle key={index} cx={x} cy={y} r="3" fill="#D4A843" />;
        })}
      </svg>
    </div>
  );
}
