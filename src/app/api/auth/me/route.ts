import { NextResponse } from "next/server";

import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";

export async function GET(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      authenticated: true,
      user: { userId: "dev", userName: "Development" },
      authMode: "disabled",
    });
  }

  const user = resolveAuthUserFromHeaders(request.headers);

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      userId: user.userId,
      userName: user.userName,
    },
    authMode: user.authMode,
  });
}
