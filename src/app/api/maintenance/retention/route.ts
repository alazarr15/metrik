import { NextResponse } from "next/server";
import { validateApiAccess } from "@/server/auth/guard";
import { pruneHistoricalObservations } from "@/server/db/retention-service";

const RETENTION_DAYS = 65;

async function handleRetention(request: Request) {
  const auth = validateApiAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const result = await pruneHistoricalObservations({
      retentionDays: RETENTION_DAYS,
    });

    return NextResponse.json({
      ok: true,
      retentionDays: result.retentionDays,
      channelsProcessed: result.channelsProcessed,
      observationsExamined: result.totalObservationsExamined,
      observationsPruned: result.totalObservationsPruned,
      anchorsPreserved: result.totalAnchorsPreserved,
      executedAt: result.referenceDateUtc.toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "MAINTENANCE_FAILED",
          message: "Failed to run retention maintenance.",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleRetention(request);
}

export async function GET(request: Request) {
  return handleRetention(request);
}
