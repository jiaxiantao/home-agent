import { createHash, randomUUID } from "node:crypto";

/** 基于 UUID 生成 16 位随机十六进制模板 ID */
export function createTeamTemplateId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/** 由稳定种子派生 16 位 ID（用于内置模板，避免每次重启变化） */
export function createStableTeamTemplateId(seed: string) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

export function isRandomTeamTemplateId(id: string) {
  return /^[a-z0-9]{16}$/.test(id);
}
