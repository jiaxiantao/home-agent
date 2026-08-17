export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { loadDfcApiEnv } = await import("@/lib/config/load-project-env");
  loadDfcApiEnv();

  const { validateProductionConfig } = await import(
    "@/lib/security/production-config"
  );

  validateProductionConfig({
    throwOnError: process.env.PRODUCTION_STRICT === "1",
  });
}
