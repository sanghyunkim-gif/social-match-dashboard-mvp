import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getWeeksData } from "../../lib/dataQueries";

export const dynamic = "force-dynamic";

const MAX_WEEKS = 520;
const DEFAULT_WEEKS = 104;
const WEEKS_CACHE_TTL = 3600;

const fetchWeeks = async (params: {
  limit?: number;
  order: "asc" | "desc";
  includeStartDate: boolean;
}) => {
  const weeks = await getWeeksData({ limit: params.limit, order: params.order });
  return { weeks, cachedAt: Date.now() };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range");
  const nParam = searchParams.get("n");
  const includeStartDate =
    searchParams.get("includeStartDate") === "1" || searchParams.get("includeStartDate") === "true";

  let limit: number | undefined;
  if (nParam !== null) {
    const parsed = Number.parseInt(nParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_WEEKS) {
      return NextResponse.json({ error: "Invalid n parameter." }, { status: 400 });
    }
    limit = parsed;
  } else if (range === "latest") {
    limit = DEFAULT_WEEKS;
  }

  try {
    if (includeStartDate) {
      const order = range === "latest" ? "desc" : "asc";
      const getWeeksCached = unstable_cache(
        () => fetchWeeks({ limit, order, includeStartDate: true }),
        ["api-weeks", `${limit ?? "all"}-${order}-with-start`],
        { revalidate: WEEKS_CACHE_TTL }
      );
      const { weeks } = await getWeeksCached();
      console.log("[weeks] n=%s count=%s", limit ?? "all", weeks.length);
      return NextResponse.json({ weeks });
    }

    if (range === "latest") {
      const getWeeksCached = unstable_cache(
        () => fetchWeeks({ limit, order: "desc", includeStartDate: false }),
        ["api-weeks", `${limit ?? "all"}-desc`],
        { revalidate: WEEKS_CACHE_TTL }
      );
      const { weeks } = await getWeeksCached();
      console.log("[weeks] n=%s count=%s", limit ?? "all", weeks.length);
      return NextResponse.json({ weeks: weeks.map((entry) => entry.week) });
    }

    const getWeeksCached = unstable_cache(
      () => fetchWeeks({ limit, order: "asc", includeStartDate: false }),
      ["api-weeks", `${limit ?? "all"}-asc`],
      { revalidate: WEEKS_CACHE_TTL }
    );
    const { weeks } = await getWeeksCached();
    console.log("[weeks] n=%s count=%s", limit ?? "all", weeks.length);
    return NextResponse.json({ weeks: weeks.map((entry) => entry.week) });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load weeks." },
      { status: 500 }
    );
  }
}
