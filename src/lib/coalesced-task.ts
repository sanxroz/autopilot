export function createCoalescedTask(
  task: () => Promise<void>,
) {
  let active: Promise<void> | null = null;
  let queued = false;
  let disposed = false;

  const run = function (): Promise<void> {
    if (disposed) return Promise.resolve();

    if (active) {
      queued = true;
      return active;
    }

    active = (async () => {
      do {
        queued = false;
        await task();
      } while (queued && !disposed);
    })().finally(() => {
      active = null;
    });

    return active;
  };

  run.dispose = () => {
    disposed = true;
    queued = false;
  };

  return run;
}
