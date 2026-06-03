import { NextResponse } from "next/server";
import { z } from "zod";

import { AdminAuthError, assertAdminTokenFromRequest } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import {
  defaultIntelligencePreferences,
  defaultLearningProfile,
  type IntelligenceHistoryEvent,
  type IntelligenceLearningProfile,
  type IntelligencePreferences,
} from "@/lib/front-intelligence-preferences";

const profileSchema = z.object({
  preferences: z.object({
    style: z.enum(["steps", "risk", "code"]),
    depth: z.enum(["brief", "detailed"]),
    includeMetrics: z.boolean(),
  }),
  learning: z.object({
    styleScores: z.object({
      steps: z.number(),
      risk: z.number(),
      code: z.number(),
    }),
    depthScores: z.object({
      brief: z.number(),
      detailed: z.number(),
    }),
  }),
  history: z
    .array(
      z.object({
        at: z.string(),
        style: z.enum(["steps", "risk", "code"]),
        depth: z.enum(["brief", "detailed"]),
        includeMetrics: z.boolean(),
      }),
    )
    .max(20),
});

const OWNER = "admin";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  try {
    assertAdminTokenFromRequest(request);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return unauthorized();
    }
    return unauthorized();
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({
      profile: {
        preferences: defaultIntelligencePreferences,
        learning: defaultLearningProfile,
        history: [] as IntelligenceHistoryEvent[],
      },
      persisted: false,
    });
  }

  const profile = await db.intelligenceProfile.findUnique({ where: { owner: OWNER } });
  if (!profile) {
    return NextResponse.json({
      profile: {
        preferences: defaultIntelligencePreferences,
        learning: defaultLearningProfile,
        history: [] as IntelligenceHistoryEvent[],
      },
      persisted: true,
    });
  }

  return NextResponse.json({
    profile: {
      preferences: profile.preferences as IntelligencePreferences,
      learning: profile.learning as IntelligenceLearningProfile,
      history: profile.history as IntelligenceHistoryEvent[],
    },
    persisted: true,
  });
}

export async function PUT(request: Request) {
  try {
    assertAdminTokenFromRequest(request);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return unauthorized();
    }
    return unauthorized();
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database unavailable for intelligence profile" },
      { status: 503 },
    );
  }

  try {
    const payload = profileSchema.parse(await request.json());
    const saved = await db.intelligenceProfile.upsert({
      where: { owner: OWNER },
      update: {
        preferences: payload.preferences,
        learning: payload.learning,
        history: payload.history,
      },
      create: {
        owner: OWNER,
        preferences: payload.preferences,
        learning: payload.learning,
        history: payload.history,
      },
    });

    return NextResponse.json({
      profile: {
        preferences: saved.preferences as IntelligencePreferences,
        learning: saved.learning as IntelligenceLearningProfile,
        history: saved.history as IntelligenceHistoryEvent[],
      },
      persisted: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid intelligence profile payload", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to persist intelligence profile" },
      { status: 500 },
    );
  }
}
