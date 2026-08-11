export const AGENT_MAX_STEPS_DEFAULT = 8;
export const AGENT_MAX_STEPS_CAP = 12;

export function getAgentMaxSteps() {
  const raw = process.env.AGENT_MAX_STEPS;
  const parsed = raw ? Number.parseInt(raw, 10) : AGENT_MAX_STEPS_DEFAULT;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return AGENT_MAX_STEPS_DEFAULT;
  }

  return Math.min(parsed, AGENT_MAX_STEPS_CAP);
}
