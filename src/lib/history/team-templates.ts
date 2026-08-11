import { agentQuickPrompts } from "@/lib/agent-quick-prompts";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

export type TeamTemplate = {
  id: string;
  label: string;
  prompt: string;
  createdAt: string;
  createdBy: string;
  builtin?: boolean;
};

const MAX_CUSTOM = 80;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const REDIS_KEY = `${PRODUCT_SLUG}:team-templates`;

const globalStore = globalThis as typeof globalThis & {
  __homeAgentTeamTemplates?: TeamTemplate[];
};

if (!globalStore.__homeAgentTeamTemplates) {
  globalStore.__homeAgentTeamTemplates = [];
}

function builtinTemplates(): TeamTemplate[] {
  return agentQuickPrompts.map((item) => ({
    id: `tpl_builtin_${item.id}`,
    label: item.label,
    prompt: item.prompt,
    createdAt: "1970-01-01T00:00:00.000Z",
    createdBy: "system",
    builtin: true,
  }));
}

async function readCustom(): Promise<TeamTemplate[]> {
  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      const raw = await client.get(REDIS_KEY);
      if (raw) {
        return JSON.parse(raw) as TeamTemplate[];
      }
    }
  }

  return [...(globalStore.__homeAgentTeamTemplates ?? [])];
}

async function writeCustom(entries: TeamTemplate[]) {
  const trimmed = entries.slice(0, MAX_CUSTOM);

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      await client.set(REDIS_KEY, JSON.stringify(trimmed), { PX: TTL_MS });
      globalStore.__homeAgentTeamTemplates = trimmed;
      return trimmed;
    }
  }

  globalStore.__homeAgentTeamTemplates = trimmed;
  return trimmed;
}

export async function listTeamTemplates() {
  const custom = await readCustom();
  const customPrompts = new Set(custom.map((item) => item.prompt));
  const builtins = builtinTemplates().filter(
    (item) => !customPrompts.has(item.prompt),
  );

  return [...custom, ...builtins].sort((a, b) => {
    if (a.builtin !== b.builtin) {
      return a.builtin ? 1 : -1;
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function createTeamTemplate(input: {
  label: string;
  prompt: string;
  createdBy: string;
}) {
  const label = input.label.trim().slice(0, 40);
  const prompt = input.prompt.trim().slice(0, 2000);

  if (!label || !prompt) {
    throw new Error("label 与 prompt 不能为空");
  }

  const current = await readCustom();
  const duplicate = current.find((item) => item.prompt === prompt);

  if (duplicate) {
    return duplicate;
  }

  const entry: TeamTemplate = {
    id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    prompt,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  await writeCustom([entry, ...current]);
  return entry;
}

export async function deleteTeamTemplate(id: string) {
  if (id.startsWith("tpl_builtin_")) {
    return false;
  }

  const current = await readCustom();
  const next = current.filter((item) => item.id !== id);

  if (next.length === current.length) {
    return false;
  }

  await writeCustom(next);
  return true;
}

/** 测试用 */
export function clearTeamTemplatesForTest() {
  globalStore.__homeAgentTeamTemplates = [];
}
