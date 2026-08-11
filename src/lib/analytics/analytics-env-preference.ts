import { PRODUCT_SLUG } from "@/lib/product";

const STORAGE_KEY = `${PRODUCT_SLUG}-analytics-env`;

export function getStoredAnalyticsEnv(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = window.localStorage.getItem(STORAGE_KEY)?.trim();
  return value || undefined;
}

export function storeAnalyticsEnv(envId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, envId.trim().toLowerCase());
}

export function clearStoredAnalyticsEnv() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
