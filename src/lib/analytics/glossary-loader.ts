import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const GLOSSARY_DIR = join(process.cwd(), "config");

let cached: Map<string, string> | null = null;

function loadGlossaryFiles(): Map<string, string> {
  if (cached) return cached;

  const map = new Map<string, string>();
  try {
    const files = readdirSync(GLOSSARY_DIR).filter((f) => f.endsWith("-glossary.md"));
    for (const file of files) {
      const dbName = file.replace(/-glossary\.md$/, "");
      const content = readFileSync(join(GLOSSARY_DIR, file), "utf-8");
      map.set(dbName, content);
    }
  } catch {
    // config dir missing in test / CI
  }
  cached = map;
  return map;
}

/**
 * Return glossary content for the given databases.
 * Returns empty string if no glossary files match.
 */
export function getGlossaryForDatabases(databases: string[]): string {
  const glossaries = loadGlossaryFiles();
  const sections: string[] = [];

  for (const db of databases) {
    const content = glossaries.get(db);
    if (content) {
      sections.push(content.trim());
    }
  }

  return sections.join("\n\n---\n\n");
}

export function listAvailableGlossaries(): string[] {
  return [...loadGlossaryFiles().keys()];
}

/** Force reload on next call (for tests) */
export function invalidateGlossaryCache() {
  cached = null;
}
