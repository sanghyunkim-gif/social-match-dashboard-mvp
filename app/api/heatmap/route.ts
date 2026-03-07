import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { randomUUID } from "crypto";
import { getHeatmap, getSupportedMetricIds } from "../../lib/dataQueries";

const allowedUnits = ["all", "area_group", "area", "stadium_group", "stadium"] as const;
const MAX_WEEKS = 104;
const HEATMAP_CACHE_TTL = 180;
const SUPPORTED_METRIC_IDS_CACHE_TTL = 3600;

type HeatmapRequestBody = {
  measureUnit: (typeof allowedUnits)[number];
  weeks: string[];
  metrics: string[];
  filterValue?: string | null;
  primaryMetricId?: string;
};

const buildHeatmapCacheKey = (params: {
  measureUnit: string;
  filterValue: string | null;
  weeks: string[];
  metrics: string[];
}) => {
  const filterKey = params.filterValue && params.filterValue.trim() !== "" ? params.filterValue.trim() : "all";
  const weeksKey = params.weeks.join("|");
  const metricsKey = params.metrics.join("|");
  return `heatmap:${params.measureUnit}:${filterKey}:${weeksKey}:${metricsKey}`;
};

const getSupportedMetricIdsCached = unstable_cache(
  async () => getSupportedMetricIds(),
  ["api-heatmap-supported-metric-ids-v1"],
  { revalidate: SUPPORTED_METRIC_IDS_CACHE_TTL }
);

export async function POST(request: Request) {
  const requestId = randomUUID();
  const totalStart = Date.now();
  let payload: Partial<HeatmapRequestBody> = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { measureUnit, filterValue, weeks, metrics, primaryMetricId } = payload;

  if (Array.isArray(weeks) && weeks.length > 0) {
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    console.log("[heatmap] request", {
      requestId,
      measureUnit,
      filterValue,
      weeksLength: weeks.length,
      firstWeek,
      lastWeek,
      metricsLength: Array.isArray(metrics) ? metrics.length : null,
      primaryMetricId
    });
  } else {
    console.log("[heatmap] request", {
      requestId,
      measureUnit,
      filterValue,
      weeksLength: Array.isArray(weeks) ? weeks.length : null,
      metricsLength: Array.isArray(metrics) ? metrics.length : null,
      primaryMetricId
    });
  }

  const expected = {
    measureUnit: "string",
    weeks: "string[]",
    metrics: "string[]",
    filterValue: "string|null (optional)",
    primaryMetricId: "string (optional)"
  };

  const badRequest = (reason: string) => {
    console.log("[heatmap] bad_request", {
      requestId,
      reason,
      body: payload
    });
    return NextResponse.json(
      {
        error: "Invalid request body",
        expected,
        received: payload,
        reason
      },
      { status: 400 }
    );
  };

  if (!measureUnit || !allowedUnits.includes(measureUnit as (typeof allowedUnits)[number])) {
    return badRequest("measureUnit is required and must be one of: all, area_group, area, stadium_group, stadium");
  }

  if (!Array.isArray(weeks) || weeks.length === 0 || weeks.length > MAX_WEEKS) {
    return badRequest(`weeks is required as a non-empty array (max ${MAX_WEEKS})`);
  }

  if (filterValue !== null && filterValue !== undefined && typeof filterValue !== "string") {
    return badRequest("filterValue must be a string or null");
  }

  if (!Array.isArray(metrics) || metrics.length === 0) {
    return badRequest("metrics is required as a non-empty string array");
  }

  const supportedMetricIds = await getSupportedMetricIdsCached();
  const supportedSet = new Set(supportedMetricIds);
  const metricIds = Array.from(
    new Set(metrics.map((metric) => String(metric).trim()).filter((metric) => supportedSet.has(metric)))
  );
  if (metricIds.length === 0) return badRequest("metrics did not include any supported metric IDs");

  const primaryMetricFinal = primaryMetricId ?? metricIds[0];

  try {
    const normalizedFilter = filterValue && filterValue.trim() !== "" ? filterValue : null;
    const cacheKey = buildHeatmapCacheKey({
      measureUnit,
      filterValue: normalizedFilter,
      weeks,
      metrics: metricIds
    });

    const getHeatmapCached = unstable_cache(
      async () => {
        const timings: { queryMs?: number; processMs?: number } = {};
        const rows = await getHeatmap(
          {
            measureUnit: measureUnit as (typeof allowedUnits)[number],
            filterValue: normalizedFilter,
            weeks,
            metrics: metricIds ? [...metricIds] : undefined
          },
          timings
        );
        return { rows, timings, cachedAt: Date.now() };
      },
      ["api-heatmap-v2", cacheKey],
      { revalidate: HEATMAP_CACHE_TTL }
    );

    const { rows, timings, cachedAt } = await getHeatmapCached();
    const totalMs = Date.now() - totalStart;
    const cacheAgeMs = Date.now() - cachedAt;
    const cacheHit = cacheAgeMs > 5;
    console.log("[heatmap] perf", {
      requestId,
      queryMs: cacheHit ? null : (timings?.queryMs ?? null),
      processMs: cacheHit ? null : (timings?.processMs ?? null),
      totalMs,
      cacheAgeMs,
      primaryMetricId: primaryMetricFinal
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[heatmap] error", {
      requestId,
      measureUnit,
      filterValue,
      weeksLength: Array.isArray(weeks) ? weeks.length : null,
      metricsLength: Array.isArray(metrics) ? metrics.length : null,
      message: (error as Error).message || "Failed to load heatmap."
    });
    return NextResponse.json({ error: (error as Error).message || "Failed to load heatmap." }, { status: 500 });
  }
}
