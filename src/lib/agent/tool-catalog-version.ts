/**
 * 工具目录版本号。managed-tools 写入后自增，langgraph/tools 的构建缓存据此失效。
 * 独立成文件是为了避免 managed-tools ↔ langgraph/tools 循环依赖。
 */

const globalStore = globalThis as typeof globalThis & {
  __dfcAgentToolCatalogVersion?: number;
};

export function getToolCatalogVersion() {
  return globalStore.__dfcAgentToolCatalogVersion ?? 0;
}

export function bumpToolCatalogVersion() {
  globalStore.__dfcAgentToolCatalogVersion = getToolCatalogVersion() + 1;
}
