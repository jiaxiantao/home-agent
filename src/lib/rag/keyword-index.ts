import type { RagDocument, RagIndex, RagSearchResult } from "@/lib/rag/types";

/**
 * In-memory keyword-based RAG index.
 * Uses TF-IDF-like scoring with Chinese/English tokenization.
 * Designed as a drop-in that can be replaced by pgvector/Pinecone/etc.
 */

const STOP_WORDS = new Set([
  "的", "了", "吗", "呢", "啊", "是", "有", "和", "与", "在",
  "为", "对", "把", "被", "到", "从", "请", "帮", "我", "看",
  "下", "一下", "多少", "几个", "什么", "哪些", "怎么", "如何",
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "of", "in", "to", "for", "on", "with", "by", "at", "from",
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const latin = text.match(/[a-zA-Z][a-zA-Z0-9_]{1,30}/g) ?? [];
  for (const t of latin) {
    const lower = t.toLowerCase();
    if (!STOP_WORDS.has(lower) && lower.length >= 2) {
      tokens.push(lower);
    }
  }
  const cn = text.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
  for (const chunk of cn) {
    if (!STOP_WORDS.has(chunk)) {
      tokens.push(chunk);
    }
  }
  return tokens;
}

type IndexedDoc = {
  doc: RagDocument;
  tokens: Set<string>;
  tokenCount: number;
};

export class KeywordRagIndex implements RagIndex {
  private docs: Map<string, IndexedDoc> = new Map();

  async upsert(docs: RagDocument[]) {
    for (const doc of docs) {
      const tokens = tokenize(doc.content);
      this.docs.set(doc.id, {
        doc,
        tokens: new Set(tokens),
        tokenCount: tokens.length,
      });
    }
  }

  async search(query: string, limit = 10): Promise<RagSearchResult[]> {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];

    const results: RagSearchResult[] = [];
    for (const indexed of this.docs.values()) {
      let hits = 0;
      for (const qt of queryTokens) {
        if (indexed.tokens.has(qt)) {
          hits++;
        } else {
          for (const dt of indexed.tokens) {
            if (dt.includes(qt) || qt.includes(dt)) {
              hits += 0.5;
              break;
            }
          }
        }
      }
      if (hits > 0) {
        const score = hits / Math.max(queryTokens.length, 1);
        results.push({ document: indexed.doc, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  count() {
    return this.docs.size;
  }
}
