import {
  resetDfcApiCatalogCache,
  setDfcApiCatalogCache,
} from "@/lib/analytics/api-catalog-store";
import { loadDfcApiCatalogFromJsonFile } from "@/lib/analytics/dfc-api-catalog-json";

export function warmDfcApiCatalogFromJsonForTests() {
  try {
    const endpoints = loadDfcApiCatalogFromJsonFile();
    setDfcApiCatalogCache(endpoints, { total: endpoints.length });
  } catch {
    setDfcApiCatalogCache([], { total: 0 });
  }
}

export function resetDfcApiCatalogForTests() {
  resetDfcApiCatalogCache();
}
