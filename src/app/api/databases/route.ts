import { NextResponse } from "next/server";

import { introspectListProjectDatabases } from "@/lib/analytics/db-introspection";

export async function GET() {
  try {
    const result = await introspectListProjectDatabases();

    return NextResponse.json({
      databases: result.summary.map((entry) => ({
        name: entry.name,
        description: entry.description,
        domain: entry.domain,
        accessible: entry.accessible,
      })),
      preferredDatabase: null,
      liveCount: result.liveAccessible.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list databases",
        databases: [],
        preferredDatabase: null,
      },
      { status: 200 },
    );
  }
}
