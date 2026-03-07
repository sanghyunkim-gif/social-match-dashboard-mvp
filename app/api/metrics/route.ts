import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { randomUUID } from "crypto";
import { getMetricDictionary } from "../../lib/dataQueries";

const METRICS_CACHE_TTL = 300;

const fetchMetrics = async () => {
  const timings: { queryMs?: number; processMs?: number } = {};
  const metrics = await getMetricDictionary(timings);
  return { metrics, timings, cachedAt: Date.now() };
};

const getMetricsCached = unstable_cache(fetchMetrics, ["api-metrics-v3-with-query-category"], {
  revalidate: METRICS_CACHE_TTL
});

export async function GET() {
  const requestId = randomUUID();
  const totalStart = Date.now();
  try {
    const { metrics, timings, cachedAt } = await getMetricsCached();
    const totalMs = Date.now() - totalStart;
    const cacheAgeMs = Date.now() - cachedAt;
    const cacheHit = cacheAgeMs > 5;
    console.log("[metrics] perf", {
      requestId,
      queryMs: cacheHit ? null : (timings?.queryMs ?? null),
      processMs: cacheHit ? null : (timings?.processMs ?? null),
      totalMs,
      cacheAgeMs
    });
    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("[metrics] error", {
      requestId,
      message: (error as Error).message || "Failed to load metrics."
    });
    return NextResponse.json({ error: (error as Error).message || "Failed to load metrics." }, { status: 500 });
  }
}
