import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthCookieName } from "@/lib/security/auth-config";
import { validateAuthToken } from "@/lib/security/auth";

const sessionSchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = sessionSchema.parse(await request.json());
    const user = validateAuthToken(body.token);

    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const response = NextResponse.json({
      ok: true,
      user: {
        userId: user.userId,
        userName: user.userName,
      },
    });

    response.cookies.set(getAuthCookieName(), body.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return NextResponse.json({ error: "Session failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
