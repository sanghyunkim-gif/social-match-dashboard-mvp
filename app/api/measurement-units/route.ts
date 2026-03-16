import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getMeasurementUnitOptions } from "../../lib/dataQueries";

export const dynamic = "force-dynamic";

const MEASUREMENT_UNIT_CACHE_TTL = 600;

const getMeasurementUnitsCached = unstable_cache(
  async () => {
    const units = await getMeasurementUnitOptions();
    return { units, cachedAt: Date.now() };
  },
  ["api-measurement-units-v1"],
  { revalidate: MEASUREMENT_UNIT_CACHE_TTL }
);

export async function GET() {
  try {
    const { units } = await getMeasurementUnitsCached();
    return NextResponse.json({ units });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load measurement units." },
      { status: 500 }
    );
  }
}
