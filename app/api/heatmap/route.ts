import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { randomUUID } from "crypto";
import { getHeatmap, getMeasurementUnitIds, getSupportedMetricIds } from "../../lib/dataQueries";

export const dynamic = "force-dynamic";

const MAX_WEEKS = 104;
const HEATMAP_CACHE_TTL = 180;
const SUPPORTED_METRIC_IDS_CACHE_TTL = 3600;

type HeatmapRequestBody = {
  measureUnit: string;
  weeks: string[];
  metrics: string[];
  filterValue?: string | null;
  primaryMetricId?: string;
  parentUnit?: string | null;
  parentValue?: string | null;
};

const buildHeatmapCacheKey = (params: {
  measureUnit: string;
  filterValue: string | null;
  weeks: string[];
  metrics: string[];
  parentUnit?: string | null;
  parentValue?: string | null;
}) => {
  const filterKey = params.filterValue && params.filterValue.trim() !== "" ? params.filterValue.trim() : "all";
  const weeksKey = params.weeks.join("|");
  const metricsKey = params.metrics.join("|");
  const parentKey =
    params.parentUnit && params.parentValue
      ? `${params.parentUnit}:${params.parentValue.trim()}`
      : "none";
  return `heatmap:${params.measureUnit}:${filterKey}:${weeksKey}:${metricsKey}:${parentKey}`;
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

  const { measureUnit, filterValue, weeks, metrics, primaryMetricId, parentUnit, parentValue } = payload;

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
      primaryMetricId,
      parentUnit,
      parentValue
    });
  } else {
    console.log("[heatmap] request", {
      requestId,
      measureUnit,
      filterValue,
      weeksLength: Array.isArray(weeks) ? weeks.length : null,
      metricsLength: Array.isArray(metrics) ? metrics.length : null,
      primaryMetricId,
      parentUnit,
      parentValue
    });
  }

  const expected = {
    measureUnit: "string",
    weeks: "string[]",
    metrics: "string[]",
    filterValue: "string|null (optional)",
    primaryMetricId: "string (optional)",
    parentUnit: "string|null (optional)",
    parentValue: "string|null (optional)"
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

  const allowedUnits = new Set(await getMeasurementUnitIds());
  if (!measureUnit || !allowedUnits.has(measureUnit)) {
    return badRequest("measureUnit is required and must be a supported measurement unit");
  }

  if (!Array.isArray(weeks) || weeks.length === 0 || weeks.length > MAX_WEEKS) {
    return badRequest(`weeks is required as a non-empty array (max ${MAX_WEEKS})`);
  }

  if (filterValue !== null && filterValue !== undefined && typeof filterValue !== "string") {
    return badRequest("filterValue must be a string or null");
  }
  if (parentUnit !== null && parentUnit !== undefined) {
    if (typeof parentUnit !== "string" || !allowedUnits.has(parentUnit)) {
      return badRequest("parentUnit must be a supported measurement unit");
    }
  }
  if (parentValue !== null && parentValue !== undefined && typeof parentValue !== "string") {
    return badRequest("parentValue must be a string or null");
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
    const normalizedParentUnit = parentUnit && parentUnit !== "all" ? parentUnit : null;
    const normalizedParentValue =
      parentValue && parentValue.trim() !== "" ? parentValue.trim() : null;
    const cacheKey = buildHeatmapCacheKey({
      measureUnit,
      filterValue: normalizedFilter,
      weeks,
      metrics: metricIds,
      parentUnit: normalizedParentUnit,
      parentValue: normalizedParentValue
    });

    const getHeatmapCached = unstable_cache(
      async () => {
        const timings: { queryMs?: number; processMs?: number } = {};
        const rows = await getHeatmap(
          {
            measureUnit,
            filterValue: normalizedFilter,
            weeks,
            metrics: metricIds ? [...metricIds] : undefined,
            parentUnit: normalizedParentUnit,
            parentValue: normalizedParentValue
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
