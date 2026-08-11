const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function assertSqlIdentifier(name: string, label = "标识符"): string {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error(`${label} 不能为空`);
  }

  if (!IDENTIFIER_PATTERN.test(trimmed)) {
    throw new Error(`${label}「${trimmed}」无效，仅允许字母、数字、下划线与连字符`);
  }

  if (trimmed.length > 64) {
    throw new Error(`${label} 过长（最多 64 字符）`);
  }

  return trimmed;
}

export function quoteSqlIdentifier(name: string) {
  return `\`${assertSqlIdentifier(name)}\``;
}
