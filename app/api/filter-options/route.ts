import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getFilterOptions, getMeasurementUnitIds } from "../../lib/dataQueries";

export const dynamic = "force-dynamic";

const FILTER_OPTIONS_CACHE_TTL = 600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const measureUnit = searchParams.get("measureUnit");
  const parentUnit = searchParams.get("parentUnit");
  const parentValue = searchParams.get("parentValue");
  const weeks = searchParams
    .getAll("week")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const allowedUnits = new Set(await getMeasurementUnitIds());

  if (!measureUnit || !allowedUnits.has(measureUnit)) {
    return NextResponse.json({ error: "Invalid measureUnit." }, { status: 400 });
  }
  if (parentUnit && !allowedUnits.has(parentUnit)) {
    return NextResponse.json({ error: "Invalid parentUnit." }, { status: 400 });
  }

  try {
    const normalizedParentValue = parentValue && parentValue.trim().length > 0 ? parentValue.trim() : null;
    const normalizedParentUnit = parentUnit && parentUnit !== "all" ? parentUnit : null;
    const cacheSuffix =
      normalizedParentUnit && normalizedParentValue
        ? `${normalizedParentUnit}:${normalizedParentValue}`
        : "none";
    const getFilterOptionsCached = unstable_cache(
      async () => {
        const options = await getFilterOptions(measureUnit, {
          parentUnit: normalizedParentUnit,
          parentValue: normalizedParentValue,
          weeks
        });
        return { options, cachedAt: Date.now() };
      },
      ["api-filter-options-v3", measureUnit, cacheSuffix],
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
