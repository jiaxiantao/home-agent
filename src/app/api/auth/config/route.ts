import { NextResponse } from "next/server";

import { getAuthMode, isAuthEnabled } from "@/lib/security/auth-config";
import { buildSsoLoginUrl, getSsoLoginUrlBase } from "@/lib/security/sso-config";

export async function GET() {
  return NextResponse.json({
    authEnabled: isAuthEnabled(),
    authMode: getAuthMode(),
    ssoLoginUrl: getSsoLoginUrlBase(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    returnUrl?: string;
  };
  const returnUrl =
    body.returnUrl?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000/agents";

  return NextResponse.json({
    loginUrl: buildSsoLoginUrl(returnUrl),
    authMode: getAuthMode(),
  });
}
