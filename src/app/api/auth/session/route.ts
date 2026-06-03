import { NextResponse } from "next/server";

import { getAdminTokenFromRequest, verifyAdminToken } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const token = getAdminTokenFromRequest(request);
  const authenticated = verifyAdminToken(token);
  return NextResponse.json({ authenticated });
}
