import "server-only";
import { supabaseServer } from "./supabaseServer";

const ALL_LABEL = "전체";
const SCHEMA_NAME = "bigquery";
const BASE_TABLE = "data_mart_1_social_match";
const METRIC_TABLE = "metric_store_native";
const WEEKLY_AGG_VIEW = "weekly_agg_mv";
const WEEK_LIMIT_DEFAULT = 104;
const POSTGREST_PAGE_SIZE = 1000;

type QueryMeasureUnit = "all" | "area_group" | "area" | "stadium_group" | "stadium";

type WeekEntry = { week: string; startDate: string | null };
type MetricDictRow = {
  metric: string;
  korean_name: string;
  description: string | null;
  query: string | null;
  category_2?: string | null;
  category_3?: string | null;
  category2?: string | null;
  category3?: string | null;
  cate2?: string | null;
  cate3?: string | null;
};
type HeatmapAggRow = {
  week: string | null;
  measure_unit: string | null;
  filter_value: string | null;
  metric_id: string | null;
  value: number | string | null;
};
type HeatmapMappedRow = { entity: string; week: string; metrics: Record<string, number> };

const hasSchemaFn = typeof (supabaseServer as { schema?: (name: string) => unknown }).schema === "function";
const schemaClient = hasSchemaFn
  ? (supabaseServer as unknown as { schema: (name: string) => typeof supabaseServer }).schema(SCHEMA_NAME)
  : supabaseServer;
const tableName = (name: string) => (hasSchemaFn ? name : `${SCHEMA_NAME}.${name}`);

const applyBaseFilters = (query: any) =>
  query
    .eq("period_type", "week")
    .is("day", null)
    .is("yoil", null)
    .is("yoil_group", null)
    .is("hour", null)
    .is("time", null);

const fetchPagedRows = async <T>(buildQuery: (from: number, to: number) => any) => {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + POSTGREST_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) break;

    from += POSTGREST_PAGE_SIZE;
  }

  return rows;
};

const isBlank = (value: unknown) => value === null || value === undefined || String(value).trim() === "";
const isRateMetric = (metricId: string) => metricId.endsWith("_rate");
const allowBaseFallback = process.env.HEATMAP_ALLOW_BASE_FALLBACK !== "0";

const metricColumnBlacklist = new Set([
  "_airbyte_raw_id",
  "_airbyte_extracted_at",
  "_airbyte_meta",
  "_airbyte_generation_id",
  "day",
  "area",
  "hour",
  "time",
  "week",
  "year",
  "yoil",
  "month",
  "quarter",
  "stadium",
  "area_group",
  "yoil_group",
  "period_type",
  "stadium_group",
  "dimension_type"
]);

const columnByUnit: Record<Exclude<QueryMeasureUnit, "all">, string> = {
  area_group: "area_group",
  area: "area",
  stadium_group: "stadium_group",
  stadium: "stadium"
};

const toCategoryLabel = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
};

const resolveMetricCategory = (row: MetricDictRow, depth: 2 | 3) => {
  if (depth === 2) {
    return (
      toCategoryLabel(row.category_2) ||
      toCategoryLabel(row.category2) ||
      toCategoryLabel(row.cate2) ||
      null
    );
  }
  return (
    toCategoryLabel(row.category_3) ||
    toCategoryLabel(row.category3) ||
    toCategoryLabel(row.cate3) ||
    null
  );
};

const buildWeekEntries = async (limit?: number) => {
  const effectiveLimit = typeof limit === "number" && limit > 0 ? limit : WEEK_LIMIT_DEFAULT;

  const { data, error } = await schemaClient
    .from(tableName("weeks_view"))
    .select("week,week_start_date")
    .order("week_start_date", { ascending: false })
    .limit(effectiveLimit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { week?: string | null; week_start_date?: string | null }[];
  return rows
    .map((row) => ({
      week: typeof row.week === "string" ? row.week.trim() : "",
      startDate: row.week_start_date ?? null
    }))
    .filter((row) => row.week);
};

async function getBaseMetricColumns() {
  const { data, error } = await schemaClient.from(tableName(BASE_TABLE)).select("*").limit(1);
  if (error) throw new Error(error.message);
  const sampleRow = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!sampleRow) return [] as string[];
  return Object.keys(sampleRow).filter((column) => !metricColumnBlacklist.has(column));
}

const mapHeatmapRows = (rows: HeatmapAggRow[], measureUnit: QueryMeasureUnit, metricIds: string[], weeks: string[]) => {
  const weekIndex = new Map(weeks.map((week, index) => [week, index]));
  const byEntity = new Map<string, Map<string, Record<string, number>>>();

  for (const row of rows) {
    const week = row.week ?? "";
    if (!week) continue;

    const entity = measureUnit === "all" ? ALL_LABEL : String(row.filter_value ?? "").trim();
    if (!entity) continue;

    const metricId = String(row.metric_id ?? "").trim();
    if (!metricId) continue;

    const value = typeof row.value === "number" ? row.value : Number(row.value ?? 0);

    if (!byEntity.has(entity)) {
      byEntity.set(entity, new Map());
    }
    const byWeek = byEntity.get(entity)!;
    if (!byWeek.has(week)) {
      const initial: Record<string, number> = {};
      metricIds.forEach((metric) => {
        initial[metric] = 0;
      });
      byWeek.set(week, initial);
    }
    byWeek.get(week)![metricId] = Number.isFinite(value) ? value : 0;
  }

  const mapped: HeatmapMappedRow[] = [];
  for (const [entity, byWeek] of byEntity.entries()) {
    for (const week of weeks) {
      if (!byWeek.has(week)) {
        const emptyMetrics: Record<string, number> = {};
        metricIds.forEach((metric) => {
          emptyMetrics[metric] = 0;
        });
        mapped.push({ entity, week, metrics: emptyMetrics });
      } else {
        mapped.push({ entity, week, metrics: byWeek.get(week)! });
      }
    }
  }

  return mapped.sort((a, b) => {
    if (a.entity !== b.entity) return a.entity.localeCompare(b.entity);
    return (weekIndex.get(a.week) ?? 0) - (weekIndex.get(b.week) ?? 0);
  });
};

const aggregateRowsToHeatmap = ({
  rows,
  measureUnit,
  unitColumn,
  metricIds
}: {
  rows: Record<string, unknown>[];
  measureUnit: QueryMeasureUnit;
  unitColumn: string | null;
  metricIds: string[];
}) => {
  type AggState = { max: number; sum: number; count: number };
  const accumulator = new Map<string, AggState>();
  for (const row of rows) {
    const week = String(row.week ?? "").trim();
    const entity = unitColumn ? String(row[unitColumn] ?? "").trim() : ALL_LABEL;
    if (!week || !entity) continue;

    for (const metricId of metricIds) {
      const raw = row[metricId];
      const value = typeof raw === "number" ? raw : Number(raw ?? NaN);
      if (!Number.isFinite(value)) continue;

      const key = `${week}|${entity}|${metricId}`;
      const prev = accumulator.get(key) ?? { max: Number.NEGATIVE_INFINITY, sum: 0, count: 0 };
      prev.max = Math.max(prev.max, value);
      prev.sum += value;
      prev.count += 1;
      accumulator.set(key, prev);
    }
  }

  const rowsOut: HeatmapAggRow[] = [];
  for (const [key, state] of accumulator.entries()) {
    const [week, entity, metricId] = key.split("|");
    const value = isRateMetric(metricId) ? state.sum / Math.max(state.count, 1) : state.max;
    rowsOut.push({
      week,
      measure_unit: measureUnit,
      filter_value: entity,
      metric_id: metricId,
      value
    });
  }

  return rowsOut;
};

const getHeatmapFromBaseTable = async ({
  measureUnit,
  filterValue,
  weeks,
  metricIds
}: {
  measureUnit: QueryMeasureUnit;
  filterValue: string | null;
  weeks: string[];
  metricIds: string[];
}) => {
  if (measureUnit === "all") {
    const selectColumns = Array.from(new Set(["week", "dimension_type", "area", ...metricIds])).join(",");
    const allRows = await fetchPagedRows<Record<string, unknown>>((from, to) => {
      let query = applyBaseFilters(
        schemaClient
          .from(tableName(BASE_TABLE))
          .select(selectColumns)
          .order("week", { ascending: true })
          .order("dimension_type", { ascending: true, nullsFirst: false })
          .range(from, to)
      );
      if (weeks.length > 0) query = query.in("week", weeks);
      return query.eq("dimension_type", "all");
    });

    const fromAll = aggregateRowsToHeatmap({
      rows: allRows,
      measureUnit: "all",
      unitColumn: null,
      metricIds
    });

    const allMetricKeySet = new Set(
      fromAll.map((row) => `${String(row.week ?? "").trim()}|${String(row.metric_id ?? "").trim()}`)
    );
    const missingWeeks = weeks.filter((week) =>
      metricIds.some((metricId) => !allMetricKeySet.has(`${week}|${metricId}`))
    );
    if (missingWeeks.length === 0) {
      return fromAll;
    }

    // Latest ingestion may miss dimension_type='all'. Build "all" from area rows for missing weeks.
    const areaRows = await fetchPagedRows<Record<string, unknown>>((from, to) => {
      let query = applyBaseFilters(
        schemaClient
          .from(tableName(BASE_TABLE))
          .select(selectColumns)
          .order("week", { ascending: true })
          .order("area", { ascending: true, nullsFirst: false })
          .range(from, to)
      );
      query = query.in("week", missingWeeks).eq("dimension_type", "area").not("area", "is", null);
      return query;
    });

    const byArea = aggregateRowsToHeatmap({
      rows: areaRows,
      measureUnit: "area",
      unitColumn: "area",
      metricIds
    });

    const collapsed = new Map<string, { sum: number; avgSum: number; avgCount: number }>();
    for (const row of byArea) {
      const week = String(row.week ?? "").trim();
      const metricId = String(row.metric_id ?? "").trim();
      const value = Number(row.value ?? NaN);
      if (!week || !metricId || !Number.isFinite(value)) continue;
      const key = `${week}|${metricId}`;
      const prev = collapsed.get(key) ?? { sum: 0, avgSum: 0, avgCount: 0 };
      if (isRateMetric(metricId)) {
        prev.avgSum += value;
        prev.avgCount += 1;
      } else {
        prev.sum += value;
      }
      collapsed.set(key, prev);
    }

    const derivedAllRows: HeatmapAggRow[] = [];
    for (const [key, state] of collapsed.entries()) {
      const [week, metricId] = key.split("|");
      const value = isRateMetric(metricId) ? state.avgSum / Math.max(state.avgCount, 1) : state.sum;
      derivedAllRows.push({
        week,
        measure_unit: "all",
        filter_value: ALL_LABEL,
        metric_id: metricId,
        value
      });
    }

    const merged = new Map<string, HeatmapAggRow>();
    for (const row of derivedAllRows) {
      const key = `${row.week}|${row.metric_id}`;
      merged.set(key, row);
    }
    for (const row of fromAll) {
      const key = `${row.week}|${row.metric_id}`;
      merged.set(key, row);
    }
    return Array.from(merged.values());
  }

  const unitColumn = columnByUnit[measureUnit];
  const selectColumns = Array.from(new Set(["week", unitColumn, ...metricIds])).join(",");
  const data = await fetchPagedRows<Record<string, unknown>>((from, to) => {
    let query = applyBaseFilters(
      schemaClient
        .from(tableName(BASE_TABLE))
        .select(selectColumns)
        .order("week", { ascending: true })
        .order(unitColumn, { ascending: true, nullsFirst: false })
        .range(from, to)
    );
    if (weeks.length > 0) {
      query = query.in("week", weeks);
    }
    query = query.not(unitColumn, "is", null);
    if (filterValue) {
      query = query.eq(unitColumn, filterValue);
    }
    return query;
  });

  return aggregateRowsToHeatmap({
    rows: data,
    measureUnit,
    unitColumn,
    metricIds
  });
};

export async function getWeeksData(options?: { limit?: number; order?: "asc" | "desc" }) {
  const limit = options?.limit ?? WEEK_LIMIT_DEFAULT;
  const order = options?.order ?? "asc";
  const entries = await buildWeekEntries(limit);
  const limited =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? entries.slice(0, limit) : entries;
  return order === "desc" ? limited : limited.slice().reverse();
}

export async function getWeeks(limit = WEEK_LIMIT_DEFAULT) {
  const entries = await getWeeksData({ limit, order: "asc" });
  return entries.map((entry) => entry.week);
}

export async function getLatestWeek() {
  const entries = await getWeeksData({ limit: 1, order: "desc" });
  return entries[0]?.week ?? null;
}

export async function getSupportedMetricIds(timings?: { queryMs?: number; processMs?: number }) {
  const queryStart = Date.now();
  const [metricDictResult, baseColumnsResult] = await Promise.all([
    schemaClient.from(tableName(METRIC_TABLE)).select("metric"),
    getBaseMetricColumns()
  ]);
  if (timings) timings.queryMs = Date.now() - queryStart;

  if (metricDictResult.error) throw new Error(metricDictResult.error.message);

  const processStart = Date.now();
  const availableColumns = new Set(baseColumnsResult);
  const metricRows = (metricDictResult.data ?? []) as { metric: string }[];
  const supported = metricRows
    .map((row) => row.metric)
    .filter((metric) => availableColumns.has(metric));
  const uniqueSorted = Array.from(new Set(supported)).sort();
  if (timings) timings.processMs = Date.now() - processStart;
  return uniqueSorted;
}

export async function getMetricDictionary(timings?: { queryMs?: number; processMs?: number }) {
  const queryStart = Date.now();
  const [metricRowsResult, supportedMetricIds] = await Promise.all([
    schemaClient.from(tableName(METRIC_TABLE)).select("*"),
    getSupportedMetricIds()
  ]);
  if (timings) timings.queryMs = Date.now() - queryStart;

  if (metricRowsResult.error) throw new Error(metricRowsResult.error.message);

  const processStart = Date.now();
  const allowed = new Set(supportedMetricIds);
  const rows = (metricRowsResult.data ?? []) as MetricDictRow[];
  const result = rows
    .filter((row) => allowed.has(row.metric))
    .map((row) => ({
      ...row,
      category2: resolveMetricCategory(row, 2),
      category3: resolveMetricCategory(row, 3)
    }))
    .sort((a, b) => a.metric.localeCompare(b.metric));
  if (timings) timings.processMs = Date.now() - processStart;
  return result;
}

export async function getFilterOptions(measureUnit: QueryMeasureUnit) {
  if (measureUnit === "all") return [ALL_LABEL];

  const data = await fetchPagedRows<{ filter_value: string | null }>((from, to) =>
    schemaClient
      .from(tableName(WEEKLY_AGG_VIEW))
      .select("filter_value")
      .eq("measure_unit", measureUnit)
      .eq("metric_id", "total_match_cnt")
      .not("filter_value", "is", null)
      .order("filter_value", { ascending: true, nullsFirst: false })
      .range(from, to)
  );

  const values = (data ?? [])
    .map((row) => row.filter_value)
    .filter((value): value is string => !isBlank(value));

  return Array.from(new Set(values)).sort();
}

type HeatmapParams = {
  measureUnit: QueryMeasureUnit;
  filterValue: string | null;
  weeks: string[];
  metrics?: string[];
};

export async function getHeatmap(
  { measureUnit, filterValue, weeks, metrics }: HeatmapParams,
  timings?: { queryMs?: number; processMs?: number }
) {
  const supportedMetricIds = await getSupportedMetricIds();
  const allowed = new Set(supportedMetricIds);
  const requested = metrics?.filter((metric) => !isBlank(metric)).map((metric) => String(metric).trim()) ?? [];
  const metricIds = (requested.length > 0 ? requested : supportedMetricIds).filter((metric) => allowed.has(metric));
  if (metricIds.length === 0) return [];

  const queryStart = Date.now();
  let rows = await fetchPagedRows<HeatmapAggRow>((from, to) => {
    let query = schemaClient
      .from(tableName(WEEKLY_AGG_VIEW))
      .select("week,measure_unit,filter_value,metric_id,value")
      .order("week", { ascending: true })
      .order("filter_value", { ascending: true, nullsFirst: false })
      .order("metric_id", { ascending: true })
      .range(from, to);

    if (weeks.length > 0) {
      query = query.in("week", weeks);
    }

    if (measureUnit === "all") {
      query = query.eq("measure_unit", "all").eq("filter_value", ALL_LABEL);
    } else {
      query = query.eq("measure_unit", measureUnit);
      if (filterValue) {
        query = query.eq("filter_value", filterValue);
      } else {
        query = query.not("filter_value", "is", null);
      }
    }

    if (metricIds.length > 0) {
      query = query.in("metric_id", metricIds);
    }

    return query;
  });
  let queryMs = Date.now() - queryStart;
  const requestedWeekSet = new Set(weeks);
  const rowWeekSet = new Set(rows.map((row) => String(row.week ?? "").trim()).filter((week) => week.length > 0));
  const missingWeeks = weeks.filter((week) => requestedWeekSet.has(week) && !rowWeekSet.has(week));
  const recentWeeks = weeks.slice(0, Math.min(2, weeks.length));
  const fallbackWeeks = Array.from(new Set([...missingWeeks, ...recentWeeks]));

  if (allowBaseFallback && (rows.length === 0 || fallbackWeeks.length > 0)) {
    const fallbackStart = Date.now();
    const fallbackRows = await getHeatmapFromBaseTable({
      measureUnit,
      filterValue,
      weeks: rows.length === 0 ? weeks : fallbackWeeks,
      metricIds
    });
    if (rows.length === 0) {
      rows = fallbackRows;
    } else if (fallbackRows.length > 0) {
      const merged = new Map<string, HeatmapAggRow>();
      for (const row of rows) {
        const key = `${row.week}|${row.measure_unit}|${row.filter_value}|${row.metric_id}`;
        merged.set(key, row);
      }
      for (const row of fallbackRows) {
        const key = `${row.week}|${row.measure_unit}|${row.filter_value}|${row.metric_id}`;
        merged.set(key, row);
      }
      rows = Array.from(merged.values());
    }
    queryMs += Date.now() - fallbackStart;
  }
  if (timings) timings.queryMs = queryMs;

  const processStart = Date.now();
  const sorted = mapHeatmapRows(rows, measureUnit, metricIds, weeks);
  if (timings) timings.processMs = Date.now() - processStart;
  return sorted;
}

export const ALL_ENTITY_LABEL = ALL_LABEL;
