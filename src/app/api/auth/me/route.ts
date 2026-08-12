import { NextResponse } from "next/server";

import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import { resolveDfcUserProfile } from "@/lib/security/dfc-user-profile";

export async function GET(request: Request) {
  const dfcUser = await resolveDfcUserProfile(request.headers);

  if (!isAuthEnabled()) {
    return NextResponse.json({
      authenticated: true,
      user: dfcUser?.linked
        ? {
            userId: dfcUser.userId ?? "dfc",
            userName: dfcUser.userName ?? "大风车用户",
          }
        : { userId: "dev", userName: "Development" },
      authMode: "disabled",
      dfcUser,
      dfcLinked: Boolean(dfcUser?.linked),
    });
  }

  const user = resolveAuthUserFromHeaders(request.headers);

  if (!user) {
    return NextResponse.json(
      { authenticated: false, dfcUser, dfcLinked: Boolean(dfcUser?.linked) },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      userId: user.userId,
      userName: user.userName,
    },
    authMode: user.authMode,
    dfcUser,
    dfcLinked: Boolean(dfcUser?.linked),
  });
}
