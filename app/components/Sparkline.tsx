"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  labels?: string[];
  formatValue?: (value: number) => string;
};

export default function Sparkline({
  values,
  width = 120,
  height = 28,
  stroke = "#4F46E5",
  labels = [],
  formatValue
}: SparklineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const points = useMemo(() => {
    if (!values.length) return [] as { x: number; y: number }[];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return { x, y };
    });
  }, [values, width, height]);

  const path = useMemo(() => {
    if (!points.length) return "";
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  }, [points]);

  useEffect(() => {
    setHoverIndex(null);
  }, [values]);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const index = Math.max(0, Math.min(points.length - 1, Math.round((x / rect.width) * (points.length - 1))));
    setHoverIndex(index);
    setTooltipPos({ x, y: event.clientY - rect.top });
  };

  const handleLeave = () => setHoverIndex(null);

  const tooltipContent =
    hoverIndex !== null && values[hoverIndex] !== undefined
      ? {
          label: labels[hoverIndex] ?? "",
          value: formatValue ? formatValue(values[hoverIndex]) : values[hoverIndex].toString()
        }
      : null;

  return (
    <div
      className="sparkline-wrap"
      ref={containerRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="sparkline">
        {path && <path d={path} fill="none" strokeWidth="2" strokeLinecap="round" stroke={stroke} />}
        {hoverIndex !== null && points[hoverIndex] && (
          <circle cx={points[hoverIndex].x} cy={points[hoverIndex].y} r="3.5" fill={stroke} />
        )}
      </svg>
      {tooltipContent && (
        <div className="sparkline-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <div className="sparkline-tooltip-label">{tooltipContent.label}</div>
          <div className="sparkline-tooltip-value">{tooltipContent.value}</div>
        </div>
      )}
    </div>
  );
}
