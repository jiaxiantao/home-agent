import type { A2UISurface } from "@/lib/a2ui/types";
import { formatAgentPlanTitle, getAgentToolLabel } from "@/lib/agent/tool-labels";
import type { AgentTraceEvent, AgentToolName } from "@/lib/agent/types";

export type ThreadActivityStep = {
  id: string;
  kind: "plan" | "tool" | "result" | "awaiting" | "error" | "trace";
  title: string;
  detail?: string;
  status: "running" | "done" | "error";
  tool?: AgentToolName;
};

export type ThreadTurnStats = {
  steps: number;
  toolCalls: number;
  totalMs: number;
};

const DETAIL_LIMIT = 4000;

function clipDetail(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return value.length > DETAIL_LIMIT ? `${value.slice(0, DETAIL_LIMIT)}…` : value;
}

export function mergeSurfaces(
  existing: A2UISurface[],
  incoming: A2UISurface[],
): A2UISurface[] {
  const map = new Map(existing.map((surface) => [surface.surfaceId, surface]));
  for (const surface of incoming) {
    map.set(surface.surfaceId, surface);
  }
  return [...map.values()];
}

export type TurnUiSnapshot = {
  surfaces: A2UISurface[];
  steps: ThreadActivityStep[];
};

export type TurnUiRecorder = {
  record: (event: AgentTraceEvent) => void;
  snapshot: () => TurnUiSnapshot;
};

export function createTurnUiRecorder(): TurnUiRecorder {
  const surfaces: A2UISurface[] = [];
  const steps: ThreadActivityStep[] = [];
  let seq = 0;

  function nextId(prefix: string) {
    seq += 1;
    return `${prefix}_${seq}`;
  }

  return {
    record(event) {
      switch (event.type) {
        case "a2ui": {
          const index = surfaces.findIndex(
            (surface) => surface.surfaceId === event.surface.surfaceId,
          );
          if (index >= 0) {
            surfaces[index] = event.surface;
          } else {
            surfaces.push(event.surface);
          }
          break;
        }
        case "plan":
          steps.push({
            id: nextId("plan"),
            kind: "plan",
            title: formatAgentPlanTitle({
              action: event.plan.action === "tool" ? "tool" : "answer",
              tool: event.plan.action === "tool" ? event.plan.tool : undefined,
              reasoning: event.plan.reasoning,
            }),
            detail: clipDetail(event.plan.reasoning),
            status: "done",
            tool: event.plan.action === "tool" ? event.plan.tool : undefined,
          });
          break;
        case "tool_call":
          steps.push({
            id: nextId("tool"),
            kind: "tool",
            title: getAgentToolLabel(event.tool),
            detail: clipDetail(JSON.stringify(event.args, null, 2)),
            status: "done",
            tool: event.tool,
          });
          break;
        case "tool_result":
          steps.push({
            id: nextId("result"),
            kind: "result",
            title: `${getAgentToolLabel(event.tool)} 结果`,
            detail: clipDetail(event.output),
            status: "done",
            tool: event.tool,
          });
          break;
        case "awaiting_input":
          steps.push({
            id: nextId("awaiting"),
            kind: "awaiting",
            title: "等待确认 SQL",
            detail: clipDetail(event.explanation),
            status: "done",
          });
          break;
        case "error":
          steps.push({
            id: nextId("error"),
            kind: "error",
            title: event.message,
            status: "error",
          });
          break;
        default:
          break;
      }
    },
    snapshot() {
      return {
        surfaces: [...surfaces],
        steps: [...steps],
      };
    },
  };
}
