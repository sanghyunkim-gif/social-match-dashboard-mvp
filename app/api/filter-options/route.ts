import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getFilterOptions } from "../../lib/dataQueries";

export const dynamic = "force-dynamic";

const allowedUnits = ["all", "area_group", "area", "stadium_group", "stadium"] as const;
const FILTER_OPTIONS_CACHE_TTL = 600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const measureUnit = searchParams.get("measureUnit");

  if (!measureUnit || !allowedUnits.includes(measureUnit as (typeof allowedUnits)[number])) {
    return NextResponse.json({ error: "Invalid measureUnit." }, { status: 400 });
  }

  try {
    const unit = measureUnit as (typeof allowedUnits)[number];
    const getFilterOptionsCached = unstable_cache(
      async () => {
        const options = await getFilterOptions(unit);
        return { options, cachedAt: Date.now() };
      },
      ["api-filter-options", unit],
      { revalidate: FILTER_OPTIONS_CACHE_TTL }
    );

    const { options } = await getFilterOptionsCached();
    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load filter options." },
      { status: 500 }
    );
  }
}
