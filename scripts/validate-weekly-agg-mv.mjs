import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const WEEKS = Number.parseInt(process.env.MV_VALIDATE_WEEKS || "8", 10);
const EPSILON = Number.parseFloat(process.env.MV_VALIDATE_EPSILON || "0.000001");
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

const UNITS = ["all", "area_group", "area", "stadium_group", "stadium"];
const WEEK_FETCH_PAGE_SIZE = 500;

const isRateMetric = (metricId) => metricId.endsWith("_rate");

const unitDimension = {
  all: ["all", null],
  area_group: ["area_group"],
  area: ["area"],
  stadium_group: ["stadium_group"],
  stadium: ["stadium"]
};

const unitFilterValue = (unit, row) => {
  if (unit === "all") return "전체";
  if (unit === "area_group") return row.area_group;
  if (unit === "area") return row.area;
  if (unit === "stadium_group") return row.stadium_group;
  if (unit === "stadium") return row.stadium;
  return null;
};

const parseWeekStartTime = (week) => {
  const match = String(week ?? "").trim().match(/^(\d{2}\.\d{2}\.\d{2})/);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Date.parse(`20${match[1].replace(/\./g, "-")}T00:00:00Z`);
};

function aggregateMetric(metricId, values) {
  if (values.length === 0) return null;
  if (isRateMetric(metricId)) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return Math.max(...values);
}

function addExpected(expected, week, unit, filterValue, metricId, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  const key = `${week}|${unit}|${filterValue}|${metricId}`;
  if (!expected.has(key)) expected.set(key, []);
  expected.get(key).push(value);
}

async function getSupportedMetrics() {
  const { data: sampleRows, error: sampleErr } = await supabase
    .schema("bigquery")
    .from("data_mart_1_social_match")
    .select("*")
    .limit(1);
  if (sampleErr) throw sampleErr;
  const sample = sampleRows?.[0] ?? {};
  const baseColumns = Object.keys(sample).filter((column) => !metricColumnBlacklist.has(column));

  const { data: metricRows, error: metricErr } = await supabase
    .schema("bigquery")
    .from("metric_store_native")
    .select("metric");
  if (metricErr) throw metricErr;

  const baseSet = new Set(baseColumns);
  const metrics = Array.from(
    new Set((metricRows ?? []).map((row) => row.metric).filter((metric) => baseSet.has(metric)))
  ).sort();

  const manual = (process.env.MV_VALIDATE_METRICS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (manual.length > 0) {
    const manualSet = new Set(manual);
    return metrics.filter((metric) => manualSet.has(metric));
  }

  return metrics;
}

async function getRecentWeeks(limit) {
  const uniqueWeeks = [];
  const seen = new Set();
  let from = 0;

  while (uniqueWeeks.length < limit) {
    const to = from + WEEK_FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .schema("bigquery")
      .from("weekly_agg_mv")
      .select("week")
      .eq("measure_unit", "all")
      .eq("filter_value", "전체")
      .order("week", { ascending: false })
      .range(from, to);
    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const week = String(row.week ?? "").trim();
      if (!week || seen.has(week)) continue;
      seen.add(week);
      uniqueWeeks.push(week);
      if (uniqueWeeks.length >= limit) break;
    }

    if (rows.length < WEEK_FETCH_PAGE_SIZE) break;
    from += WEEK_FETCH_PAGE_SIZE;
  }

  return uniqueWeeks.sort((a, b) => parseWeekStartTime(b) - parseWeekStartTime(a));
}

async function main() {
  const METRICS = await getSupportedMetrics();
  if (METRICS.length === 0) throw new Error("No supported metrics found for validation.");
  const weeks = await getRecentWeeks(WEEKS);
  if (weeks.length === 0) throw new Error("No recent weeks from weekly_agg_mv");

  const expectedMap = new Map();
  let sourceRows = 0;

  for (const week of weeks) {
    const { data: rows, error } = await supabase
      .schema("bigquery")
      .from("data_mart_1_social_match")
      .select(["week", "dimension_type", "area_group", "area", "stadium_group", "stadium", ...METRICS].join(","))
      .eq("period_type", "week")
      .is("day", null)
      .is("yoil", null)
      .is("yoil_group", null)
      .is("hour", null)
      .is("time", null)
      .eq("week", week)
      .limit(5000);
    if (error) throw error;

    sourceRows += (rows ?? []).length;
    for (const row of rows ?? []) {
      const dim = row.dimension_type ?? null;
      for (const unit of UNITS) {
        if (!unitDimension[unit].includes(dim)) continue;
        const filterValue = unitFilterValue(unit, row);
        if (!filterValue) continue;
        for (const metricId of METRICS) {
          addExpected(expectedMap, row.week, unit, String(filterValue), metricId, row[metricId]);
        }
      }
    }
  }

  const expectedFinal = new Map();
  for (const [key, values] of expectedMap.entries()) {
    const metricId = key.split("|").at(-1);
    expectedFinal.set(key, aggregateMetric(metricId, values));
  }

  const actual = new Map();
  let mvRows = 0;

  for (const week of weeks) {
    for (const unit of UNITS) {
      for (const metricId of METRICS) {
        const { data, error } = await supabase
          .schema("bigquery")
          .from("weekly_agg_mv")
          .select("week,measure_unit,filter_value,metric_id,value")
          .eq("week", week)
          .eq("measure_unit", unit)
          .eq("metric_id", metricId)
          .limit(5000);
        if (error) throw error;

        const rows = data ?? [];
        mvRows += rows.length;
        for (const row of rows) {
          const key = `${row.week}|${row.measure_unit}|${row.filter_value}|${row.metric_id}`;
          actual.set(key, Number(row.value));
        }
      }
    }
  }

  let missingRows = 0;
  let mismatchRows = 0;
  const mismatchByMetric = {};
  const missingByUnit = {};
  const samples = [];

  for (const [key, expectedValue] of expectedFinal.entries()) {
    const actualValue = actual.get(key);
    const [week, unit, filterValue, metricId] = key.split("|");
    if (actualValue === undefined) {
      missingRows += 1;
      missingByUnit[unit] = (missingByUnit[unit] ?? 0) + 1;
      if (samples.length < 12) samples.push({ type: "missing", week, unit, filterValue, metricId, expectedValue });
      continue;
    }
    if (Math.abs(actualValue - expectedValue) > EPSILON) {
      mismatchRows += 1;
      mismatchByMetric[metricId] = (mismatchByMetric[metricId] ?? 0) + 1;
      if (samples.length < 12) {
        samples.push({
          type: "mismatch",
          week,
          unit,
          filterValue,
          metricId,
          expectedValue,
          actualValue
        });
      }
    }
  }

  const summary = {
    checkedWeeks: weeks.length,
    epsilon: EPSILON,
    metricsCount: METRICS.length,
    metrics: METRICS,
    units: UNITS,
    sourceRows,
    mvRows,
    expectedKeys: expectedFinal.size,
    actualKeys: actual.size,
    missingRows,
    mismatchRows,
    missingByUnit,
    mismatchByMetric,
    samples
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
