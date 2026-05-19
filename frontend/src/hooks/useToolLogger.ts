export function useToolLogger() {
  return {
    log: (_payload: Record<string, unknown>) => {
      // no-op: tool logger removed from standalone
    },
  };
}
