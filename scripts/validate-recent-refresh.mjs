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
const UNITS = ["all", "area_group", "area", "stadium_group", "stadium"];
const METRIC_ID = process.env.MV_HEALTHCHECK_METRIC || "total_match_cnt";
const CHECK_WEEKS = Number.parseInt(process.env.MV_HEALTHCHECK_WEEKS || "3", 10);
const WEEK_FETCH_PAGE_SIZE = 500;

const formatError = (error) => {
  if (!error) return { message: "Unknown error" };
  return {
    message: error.message ?? "Unknown error",
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    name: error.name ?? null
  };
};

const executeCountQuery = async ({ week, unit, metricId, queryType }) => {
  let query = supabase
    .schema("bigquery")
    .from("weekly_agg_mv")
    .select("week", { count: "exact", head: true })
    .eq("week", week)
    .eq("measure_unit", unit);

  if (metricId) {
    query = query.eq("metric_id", metricId);
  }

  const { count, error } = await query;
  if (error) {
    const wrappedError = new Error(`weekly_agg_mv ${queryType} query failed`);
    wrappedError.context = {
      queryType,
      week,
      unit,
      metricId: metricId ?? null
    };
    wrappedError.supabaseError = formatError(error);
    throw wrappedError;
  }

  return count ?? 0;
};

const ensureCount = async (week, unit) =>
  executeCountQuery({
    week,
    unit,
    queryType: "row_count"
  });

const ensureMetricCount = async (week, unit, metricId) =>
  executeCountQuery({
    week,
    unit,
    metricId,
    queryType: "metric_count"
  });

const formatFailure = ({ week, unit, metricId, rowCount, metricCount }) => {
  const parts = [
    `week=${week}`,
    `unit=${unit}`,
    `rowCount=${rowCount}`,
    `metricId=${metricId}`,
    `metricCount=${metricCount}`
  ];
  return parts.join(", ");
};

const parseWeekStartTime = (week) => {
  const match = String(week ?? "").trim().match(/^(\d{2}\.\d{2}\.\d{2})/);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Date.parse(`20${match[1].replace(/\./g, "-")}T00:00:00Z`);
};

const getRecentWeeks = async (limit) => {
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
};

const main = async () => {
  const weeks = await getRecentWeeks(CHECK_WEEKS);
  if (weeks.length === 0) {
    throw new Error("No recent weeks found in weekly_agg_mv.");
  }

  const failures = [];
  const summary = [];

  for (const week of weeks) {
    for (const unit of UNITS) {
      const rowCount = await ensureCount(week, unit);
      const metricCount = await ensureMetricCount(week, unit, METRIC_ID);
      summary.push({ week, unit, rowCount, metricId: METRIC_ID, metricCount });

      if (rowCount <= 0) {
        failures.push(`No rows in weekly_agg_mv: ${formatFailure({ week, unit, metricId: METRIC_ID, rowCount, metricCount })}`);
      }
      if (metricCount <= 0) {
        failures.push(`Missing metric rows: ${formatFailure({ week, unit, metricId: METRIC_ID, rowCount, metricCount })}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        metric: METRIC_ID,
        checkedWeeks: weeks,
        summary
      },
      null,
      2
    )
  );

  if (failures.length > 0) {
    console.error("\nMV healthcheck failed:");
    for (const fail of failures) console.error(`- ${fail}`);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("MV healthcheck execution failed.");
  if (error?.context) {
    console.error("Context:");
    console.error(JSON.stringify(error.context, null, 2));
  }
  if (error?.supabaseError) {
    console.error("Supabase error:");
    console.error(JSON.stringify(error.supabaseError, null, 2));
  } else if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
