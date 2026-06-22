import type { AgentTraceEvent } from "@/lib/agent/types";

export function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
