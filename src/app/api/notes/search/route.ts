import { NextResponse } from "next/server";
import { z } from "zod";

import { searchNotesDetailed } from "@/lib/note-search";

const searchSchema = z.object({
  q: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = searchSchema.parse({
      q: searchParams.get("q") ?? "",
      limit: searchParams.get("limit") ?? 8,
    });

    const engine = searchParams.get("engine");
    const payload = await searchNotesDetailed(parsed.q, parsed.limit, {
      forceEngine: engine === "memory" ? "memory" : undefined,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid search query", details: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
