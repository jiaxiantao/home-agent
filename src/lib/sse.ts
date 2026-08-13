import type { AgentTraceEvent } from "@/lib/agent/types";

/** 约 2KB 注释帧，用来冲掉 nginx / 浏览器对小 SSE 块的缓冲 */
export const SSE_PAD_COMMENT = `: ${" ".repeat(2048)}\n\n`;

export function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function isSseCommentBlock(block: string) {
  return block.split("\n").every((line) => !line.trim() || line.startsWith(":"));
}

export function takeSseBlocks(buffer: string) {
  const blocks: string[] = [];
  let rest = buffer;
  let boundary = rest.indexOf("\n\n");

  while (boundary !== -1) {
    const block = rest.slice(0, boundary).trim();
    rest = rest.slice(boundary + 2);
    if (block && !isSseCommentBlock(block)) {
      blocks.push(block);
    }
    boundary = rest.indexOf("\n\n");
  }

  return { blocks, rest };
}

export function parseSseBlock(block: string) {
  let event = "message";
  let data = "";

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!data) {
    return null;
  }

  try {
    return { event, payload: JSON.parse(data) as AgentTraceEvent };
  } catch {
    return null;
  }
}
