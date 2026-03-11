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

const ensureCount = async (week, unit) => {
  const { count, error } = await supabase
    .schema("bigquery")
    .from("weekly_agg_mv")
    .select("week", { count: "exact", head: true })
    .eq("week", week)
    .eq("measure_unit", unit);
  if (error) throw error;
  return count ?? 0;
};

const ensureMetricCount = async (week, unit, metricId) => {
  const { count, error } = await supabase
    .schema("bigquery")
    .from("weekly_agg_mv")
    .select("week", { count: "exact", head: true })
    .eq("week", week)
    .eq("measure_unit", unit)
    .eq("metric_id", metricId);
  if (error) throw error;
  return count ?? 0;
};

const main = async () => {
  const { data: weeksData, error: weekErr } = await supabase
    .schema("bigquery")
    .from("weeks_view")
    .select("week")
    .order("week_start_date", { ascending: false })
    .limit(CHECK_WEEKS);
  if (weekErr) throw weekErr;

  const weeks = (weeksData ?? []).map((row) => row.week).filter(Boolean);
  if (weeks.length === 0) {
    throw new Error("No weeks found in weeks_view.");
  }

  const failures = [];
  const summary = [];

  for (const week of weeks) {
    for (const unit of UNITS) {
      const rowCount = await ensureCount(week, unit);
      const metricCount = await ensureMetricCount(week, unit, METRIC_ID);
      summary.push({ week, unit, rowCount, metricId: METRIC_ID, metricCount });

      if (rowCount <= 0) {
        failures.push(`No rows in weekly_agg_mv for week=${week}, unit=${unit}`);
      }
      if (metricCount <= 0) {
        failures.push(`No ${METRIC_ID} rows for week=${week}, unit=${unit}`);
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
  console.error(error);
  process.exit(1);
});
