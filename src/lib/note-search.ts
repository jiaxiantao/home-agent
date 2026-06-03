import { getDb } from "@/lib/db";
import type { NoteRecord } from "@/lib/notes-service";
import { listNotes } from "@/lib/notes-service";
import { ensurePgTrgmExtension } from "@/lib/pg-trgm";

export type NoteSearchResult = NoteRecord & {
  score: number;
  similarity?: number;
};

export type NoteSearchResponse = {
  query: string;
  engine: "pg_trgm" | "memory";
  extensionEnabled: boolean;
  results: NoteSearchResult[];
};

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`~\-_/\\]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scoreText(haystack: string, terms: string[]) {
  const normalized = haystack.toLowerCase();

  return terms.reduce((score, term) => {
    if (!term) {
      return score;
    }

    if (normalized.includes(term)) {
      return score + 1;
    }

    return score;
  }, 0);
}

function scoreNote(note: NoteRecord, query: string) {
  const terms = tokenize(query);

  if (!terms.length) {
    return 0;
  }

  const titleScore = scoreText(note.title, terms) * 4;
  const summaryScore = scoreText(note.summary ?? "", terms) * 2;
  const tagScore = scoreText(note.tags.join(" "), terms) * 3;
  const contentScore = scoreText(note.contentMarkdown, terms);

  return titleScore + summaryScore + tagScore + contentScore;
}

async function searchNotesInMemoryAsync(
  query: string,
  limit: number,
): Promise<NoteSearchResult[]> {
  const notes = await listNotes();
  const publishedNotes = notes.filter((note) => note.isPublished);

  const results: NoteSearchResult[] = publishedNotes
    .map((note) => ({
      ...note,
      score: scoreNote(note, query),
    }))
    .filter((note) => note.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  if (results.length) {
    return results;
  }

  return publishedNotes.slice(0, limit).map((note) => ({
    ...note,
    score: 0,
  }));
}

async function searchNotesWithPgTrgm(
  query: string,
  limit: number,
): Promise<NoteSearchResult[] | null> {
  const db = getDb();

  if (!db) {
    return null;
  }

  const extensionEnabled = await ensurePgTrgmExtension();

  if (!extensionEnabled) {
    return null;
  }

  try {
    const rows = await db.$queryRaw<
      Array<{
        id: string;
        title: string;
        slug: string;
        summary: string | null;
        contentMarkdown: string;
        tags: string[];
        isPublished: boolean;
        createdAt: Date;
        updatedAt: Date;
        score: number;
      }>
    >`
      SELECT
        id,
        title,
        slug,
        summary,
        "contentMarkdown",
        tags,
        "isPublished",
        "createdAt",
        "updatedAt",
        GREATEST(
          similarity(title, ${query}),
          similarity(COALESCE(summary, ''), ${query}),
          similarity("contentMarkdown", ${query})
        )::float AS score
      FROM "Note"
      WHERE "isPublished" = true
        AND (
          title % ${query}
          OR COALESCE(summary, '') % ${query}
          OR "contentMarkdown" % ${query}
          OR title ILIKE ${`%${query}%`}
          OR COALESCE(summary, '') ILIKE ${`%${query}%`}
        )
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      contentMarkdown: row.contentMarkdown,
      tags: row.tags,
      isPublished: row.isPublished,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      score: Number(row.score),
      similarity: Number(row.score),
    }));
  } catch {
    return null;
  }
}

export async function searchNotesMemoryOnly(
  query: string,
  limit = 8,
): Promise<NoteSearchResponse> {
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      query: "",
      engine: "memory",
      extensionEnabled: false,
      results: [],
    };
  }

  const extensionEnabled = await ensurePgTrgmExtension();
  const memoryResults = await searchNotesInMemoryAsync(trimmed, limit);

  return {
    query: trimmed,
    engine: "memory",
    extensionEnabled,
    results: memoryResults,
  };
}

export async function searchNotesDetailed(
  query: string,
  limit = 8,
  options?: { forceEngine?: "memory" | "pg_trgm" },
): Promise<NoteSearchResponse> {
  if (options?.forceEngine === "memory") {
    return searchNotesMemoryOnly(query, limit);
  }
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      query: "",
      engine: "memory",
      extensionEnabled: false,
      results: [],
    };
  }

  const extensionEnabled = await ensurePgTrgmExtension();
  const trgmResults = await searchNotesWithPgTrgm(trimmed, limit);

  if (trgmResults) {
    return {
      query: trimmed,
      engine: "pg_trgm",
      extensionEnabled,
      results: trgmResults,
    };
  }

  const memoryResults = await searchNotesInMemoryAsync(trimmed, limit);

  return {
    query: trimmed,
    engine: "memory",
    extensionEnabled,
    results: memoryResults,
  };
}

export async function searchNotes(query: string, limit = 5) {
  const { results } = await searchNotesDetailed(query, limit);
  return results;
}