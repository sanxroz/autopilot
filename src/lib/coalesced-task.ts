export function createCoalescedTask(
  task: () => Promise<void>,
): () => Promise<void> {
  let active: Promise<void> | null = null;
  let queued = false;

  return function run(): Promise<void> {
    if (active) {
      queued = true;
      return active;
    }

    active = (async () => {
      do {
        queued = false;
        await task();
      } while (queued);
    })().finally(() => {
      active = null;
    });

    return active;
  };
}
