import type { ThreadMessage } from "@/lib/agent/thread-types";

export type RestoredConversationTurn = {
  id: string;
  question: string;
  surfaces: [];
  finalAnswer: string;
  stats: null;
  isMock: false;
  status: "done";
  steps: [];
};

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
      last.finalAnswer = message.content;
    } else {
      turns.push({
        id: `hist_${message.ts}_assistant`,
        question: "",
        surfaces: [],
        finalAnswer: message.content,
        stats: null,
        isMock: false,
        status: "done",
        steps: [],
      });
    }
  }

  return turns.filter((item) => item.question || item.finalAnswer);
}
