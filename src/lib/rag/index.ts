import { KeywordRagIndex } from "@/lib/rag/keyword-index";
import type { RagDocument, RagIndex, RagSearchResult } from "@/lib/rag/types";
import { getGlossaryForDatabases, listAvailableGlossaries } from "@/lib/analytics/glossary-loader";
import { dfcBusinessEntities } from "@/lib/analytics/business-glossary";
import { questionRouteRules } from "@/lib/analytics/question-router";
import { isAppMysqlConfigured, queryAppMysql } from "@/lib/app-mysql/client";
import type { RowDataPacket } from "mysql2/promise";

export type { RagDocument, RagSearchResult };

const globalStore = globalThis as typeof globalThis & {
  __dfcRagIndex?: RagIndex;
  __dfcRagInitialized?: boolean;
};

function getOrCreateIndex(): RagIndex {
  if (!globalStore.__dfcRagIndex) {
    globalStore.__dfcRagIndex = new KeywordRagIndex();
  }
  return globalStore.__dfcRagIndex;
}

async function loadGlossaryDocs(): Promise<RagDocument[]> {
  const docs: RagDocument[] = [];
  const dbs = listAvailableGlossaries();
  for (const db of dbs) {
    const content = getGlossaryForDatabases([db]);
    if (content) {
      docs.push({
        id: `glossary:${db}`,
        source: "glossary",
        database: db,
        content,
      });
    }
  }
  return docs;
}

function loadBusinessEntityDocs(): RagDocument[] {
  return dfcBusinessEntities.map((entity) => ({
    id: `entity:${entity.database}.${entity.table}`,
    source: "glossary" as const,
    database: entity.database,
    table: entity.table,
    content: [
      entity.terms.join(" "),
      entity.description,
      entity.disambiguation ?? "",
      entity.filters?.join(" ") ?? "",
    ].join(" "),
  }));
}

function loadRouteRuleDocs(): RagDocument[] {
  return questionRouteRules.map((rule, i) => ({
    id: `route:${i}`,
    source: "route_rule" as const,
    content: [
      rule.reason,
      rule.databases.join(" "),
      rule.searchTerms.join(" "),
    ].join(" "),
  }));
}

async function loadHistoryQaDocs(): Promise<RagDocument[]> {
  if (!isAppMysqlConfigured()) return [];
  try {
    const rows = await queryAppMysql<RowDataPacket & { question: string; answer: string; thread_id: string }>(
      `SELECT question, COALESCE(answer, '') as answer, thread_id
       FROM query_history
       WHERE status = 'done' AND answer IS NOT NULL AND answer != ''
       ORDER BY created_at DESC LIMIT 200`,
    );
    return rows.map((row, i) => ({
      id: `qa:${row.thread_id}:${i}`,
      source: "history_qa" as const,
      content: `Q: ${row.question}\nA: ${row.answer.slice(0, 500)}`,
    }));
  } catch {
    return [];
  }
}

export async function ensureRagIndex(): Promise<RagIndex> {
  const index = getOrCreateIndex();
  if (globalStore.__dfcRagInitialized) {
    return index;
  }

  const [glossary, qa] = await Promise.all([
    loadGlossaryDocs(),
    loadHistoryQaDocs(),
  ]);
  const entities = loadBusinessEntityDocs();
  const routes = loadRouteRuleDocs();

  await index.upsert([...glossary, ...entities, ...routes, ...qa]);
  globalStore.__dfcRagInitialized = true;
  return index;
}

export async function searchRag(query: string, limit = 5): Promise<RagSearchResult[]> {
  const index = await ensureRagIndex();
  return index.search(query, limit);
}

export function formatRagResultsForPrompt(results: RagSearchResult[]): string {
  if (!results.length) return "";
  return results
    .map((r) => {
      const source = r.document.source === "history_qa" ? "历史问答" :
        r.document.source === "glossary" ? "业务口径" :
        r.document.source === "route_rule" ? "路由规则" : "表注释";
      return `[${source}] ${r.document.content.slice(0, 300)}`;
    })
    .join("\n---\n");
}

export function invalidateRagIndex() {
  globalStore.__dfcRagIndex = undefined;
  globalStore.__dfcRagInitialized = false;
}
