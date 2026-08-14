import { NextResponse } from "next/server";

import {
  DFC_SSO_SESSION_COOKIE,
  DFC_SSO_SESSION_COOKIE_LEGACY,
  forgetDfcUserProfile,
  resolveDfcUserProfile,
  resolveSsoCredentialsFromRequest,
} from "@/lib/security/dfc-user-profile";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const probeHeaders = new Headers(request.headers);
  probeHeaders.set(
    "cookie",
    `${DFC_SSO_SESSION_COOKIE}=${encodeURIComponent(token)}`,
  );

  const dfcUser = await resolveDfcUserProfile(probeHeaders, { refresh: true });
  if (!dfcUser?.linked) {
    return NextResponse.json(
      { error: "无法验证大风车 SSO Token，请确认已从 Mars 复制 _security_token" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true, dfcUser });
  response.cookies.set(DFC_SSO_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  response.cookies.set(DFC_SSO_SESSION_COOKIE_LEGACY, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

/** 清除侧栏同步的 SSO：删除 `_security_token`（及旧版 dfc_sso_token） */
export async function DELETE(request: Request) {
  forgetDfcUserProfile(resolveSsoCredentialsFromRequest(request.headers));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DFC_SSO_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(DFC_SSO_SESSION_COOKIE_LEGACY, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
