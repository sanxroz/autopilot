export function createKeyedTaskRunner() {
  const active = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  return {
    has: (key: string) => active.has(key),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run(key: string, task: () => Promise<void>): Promise<void> {
      const existing = active.get(key);
      if (existing) return existing;

      const operation = task().finally(() => {
        active.delete(key);
        notify();
      });
      active.set(key, operation);
      notify();
      return operation;
    },
  };
}
