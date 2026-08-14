import type { A2UISurface } from "@/lib/a2ui/types";
import type { ThreadMessage } from "@/lib/agent/thread-types";
import {
  mergeSurfaces,
  type ThreadActivityStep,
  type ThreadTurnStats,
} from "@/lib/agent/thread-ui";

export type RestoredConversationTurn = {
  id: string;
  question: string;
  surfaces: A2UISurface[];
  finalAnswer: string;
  stats: ThreadTurnStats | null;
  isMock: false;
  status: "done";
  steps: ThreadActivityStep[];
};

function applyAssistantMessage(
  turn: RestoredConversationTurn,
  message: ThreadMessage,
) {
  if (message.content.trim()) {
    turn.finalAnswer = message.content;
  }
  turn.surfaces = mergeSurfaces(turn.surfaces, message.surfaces ?? []);
  turn.steps = [...turn.steps, ...(message.steps ?? [])];
  if (message.stats) {
    turn.stats = message.stats;
  }
}

export function threadMessagesToTurns(
  messages: ThreadMessage[],
): RestoredConversationTurn[] {
  const turns: RestoredConversationTurn[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      turns.push({
        id: `hist_${message.ts}_${turns.length}`,
        question: message.content,
        surfaces: [],
        finalAnswer: "",
        stats: null,
        isMock: false,
        status: "done",
        steps: [],
      });
      continue;
    }

    const last = turns.at(-1);
    if (last) {
      applyAssistantMessage(last, message);
    } else {
      const turn: RestoredConversationTurn = {
        id: `hist_${message.ts}_assistant`,
        question: "",
        surfaces: [],
        finalAnswer: "",
        stats: null,
        isMock: false,
        status: "done",
        steps: [],
      };
      applyAssistantMessage(turn, message);
      turns.push(turn);
    }
  }

  return turns.filter(
    (item) => item.question || item.finalAnswer || item.surfaces.length,
  );
}
