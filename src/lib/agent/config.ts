export function getAgentMaxSteps() {
  const raw = process.env.AGENT_MAX_STEPS;
  const parsed = raw ? Number.parseInt(raw, 10) : 4;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 4;
  }

  return Math.min(parsed, 12);
}
