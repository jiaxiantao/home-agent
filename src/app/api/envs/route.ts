import { NextResponse } from "next/server";

import { listAnalyticsEnvProfiles } from "@/lib/analytics/mysql";

export async function GET() {
  const profiles = listAnalyticsEnvProfiles();
  const defaultId = profiles.find((item) => item.configured)?.id ?? profiles[0]?.id;

  return NextResponse.json({
    profiles,
    defaultEnv: defaultId ?? "test",
  });
}
