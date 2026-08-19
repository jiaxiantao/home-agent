export type RagDocument = {
  id: string;
  source: "glossary" | "table_comment" | "history_qa" | "route_rule";
  database?: string;
  table?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type RagSearchResult = {
  document: RagDocument;
  score: number;
};

export interface RagIndex {
  upsert(docs: RagDocument[]): Promise<void>;
  search(query: string, limit?: number): Promise<RagSearchResult[]>;
  count(): number;
}
