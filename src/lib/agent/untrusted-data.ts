/**
 * 间接提示注入防护：后端接口响应与数据库行内容都可能被外部写入，
 * 把它们塞进模型上下文前必须标记为「数据」而不是「指令」。
 */

const OPEN_TAG = "<untrusted_data>";
const CLOSE_TAG = "</untrusted_data>";

/** 数据自带的边界标记会让模型误以为数据区已结束，一律中和掉 */
function neutralizeBoundaryMarkers(content: string) {
  return content.replace(/<\/?untrusted_data\s*>/gi, (match) =>
    match.replace(/[<>]/g, (bracket) => (bracket === "<" ? "\u2039" : "\u203a")),
  );
}

export function wrapUntrustedData(content: string) {
  return `${OPEN_TAG}\n${neutralizeBoundaryMarkers(content)}\n${CLOSE_TAG}`;
}

export function isUntrustedDataWrapped(content: string) {
  return content.trimStart().startsWith(OPEN_TAG);
}

/** 取回原始载荷用于机器解析；模型看到的仍是带标记的版本 */
export function stripUntrustedWrapper(content: string) {
  if (!isUntrustedDataWrapped(content)) {
    return content;
  }
  return content
    .trim()
    .slice(OPEN_TAG.length)
    .replace(new RegExp(`${CLOSE_TAG}$`), "")
    .trim();
}
