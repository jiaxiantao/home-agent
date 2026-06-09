import type { Note } from "@prisma/client";

import { getDb } from "@/lib/db";

export type NoteRecord = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  contentMarkdown: string;
  tags: string[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapNote(note: Note): NoteRecord {
  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    summary: note.summary,
    contentMarkdown: note.contentMarkdown,
    tags: note.tags,
    isPublished: note.isPublished,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function listNotes() {
  const db = getDb();

  if (!db) {
    return [] as NoteRecord[];
  }

  try {
    const notes = await db.note.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });

    return notes.map(mapNote);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[notes-service] listNotes failed:", error);
    }

    return [];
  }
}
