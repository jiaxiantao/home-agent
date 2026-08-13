import { NextResponse, type NextRequest } from "next/server";

import { PRODUCT_SLUG } from "@/lib/product";
import {
  getAuthMode,
  isAuthEnabled,
} from "@/lib/security/auth-config";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { buildSsoLoginUrl } from "@/lib/security/sso-config";

const PUBLIC_PATHS = ["/login", "/api/auth/session", "/api/auth/config", "/api/auth/sso-token", "/api/health"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function unauthorizedResponse(request: NextRequest) {
  const authMode = getAuthMode();
  const returnUrl = request.nextUrl.href;
  const loginUrl =
    authMode === "sso" ? buildSsoLoginUrl(returnUrl) : undefined;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        loginUrl,
        authMode,
      },
      { status: 401 },
    );
  }

  if (authMode === "sso" && loginUrl) {
    return NextResponse.redirect(loginUrl);
  }

  const localLogin = request.nextUrl.clone();
  localLogin.pathname = "/login";
  localLogin.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(localLogin);
}

export function proxy(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const user = resolveAuthUserFromHeaders(request.headers);

  if (!user) {
    return unauthorizedResponse(request);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(`x-${PRODUCT_SLUG}-auth-user-id`, user.userId);

  if (user.userName) {
    requestHeaders.set(`x-${PRODUCT_SLUG}-auth-user-name`, user.userName);
  }

  requestHeaders.set(`x-${PRODUCT_SLUG}-auth-mode`, getAuthMode());

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/agents/:path*",
    "/api/agent",
    "/api/auth/me",
    "/api/history",
    "/api/agent-threads",
    "/api/audit",
    "/api/favorites",
    "/api/templates",
    "/api/envs",
    "/api/databases",
    "/",
  ],
};
