import { NextResponse, type NextRequest } from "next/server";

import {
  getAuthCookieName,
  getAuthMode,
  isAuthEnabled,
} from "@/lib/security/auth-config";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/session", "/api/health"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
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
  requestHeaders.set("x-home-agent-auth-user-id", user.userId);

  if (user.userName) {
    requestHeaders.set("x-home-agent-auth-user-name", user.userName);
  }

  requestHeaders.set("x-home-agent-auth-mode", getAuthMode());

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
    "/api/audit",
    "/api/favorites",
    "/api/envs",
    "/",
  ],
};
