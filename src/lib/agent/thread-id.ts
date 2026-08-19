export function createThreadId() {
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
