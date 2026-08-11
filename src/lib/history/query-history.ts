export type QueryHistoryEntry = {
  id: string;
  threadId: string;
  question: string;
  answer?: string;
  sql?: string;
  rowCount?: number;
  createdAt: string;
  status: "awaiting" | "done" | "error" | "cancelled";
};

const STORAGE_KEY = "home-agent-query-history-v1";
const MAX_ENTRIES = 50;

function readAll(): QueryHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as QueryHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: QueryHistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(entries.slice(0, MAX_ENTRIES)),
  );
}

export function listQueryHistory() {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsertQueryHistory(entry: QueryHistoryEntry) {
  const current = readAll().filter((item) => item.id !== entry.id);
  writeAll([entry, ...current]);
}

export function removeQueryHistory(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function clearQueryHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function createHistoryEntry(input: {
  threadId: string;
  question: string;
  status: QueryHistoryEntry["status"];
  sql?: string;
  answer?: string;
  rowCount?: number;
}) {
  const entry: QueryHistoryEntry = {
    id: crypto.randomUUID(),
    threadId: input.threadId,
    question: input.question,
    status: input.status,
    sql: input.sql,
    answer: input.answer,
    rowCount: input.rowCount,
    createdAt: new Date().toISOString(),
  };

  upsertQueryHistory(entry);
  return entry;
}

export function updateQueryHistory(
  id: string,
  patch: Partial<Omit<QueryHistoryEntry, "id">>,
) {
  const current = readAll();
  const index = current.findIndex((item) => item.id === id);

  if (index < 0) {
    return null;
  }

  const next = { ...current[index]!, ...patch };
  current[index] = next;
  writeAll(current);
  return next;
}
