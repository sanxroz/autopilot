import { describe, expect, test } from "bun:test";
import { createCoalescedTask } from "../src/lib/coalesced-task";

describe("createCoalescedTask", () => {
  test("runs one active task and one queued follow-up", async () => {
    let release: (() => void) | undefined;
    let runs = 0;
    const task = createCoalescedTask(async () => {
      runs += 1;
      if (runs === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });

    const first = task();
    const second = task();
    const third = task();

    expect(runs).toBe(1);
    expect(second).toBe(first);
    expect(third).toBe(first);

    release?.();
    await first;

    expect(runs).toBe(2);
  });

  test("can run again after the active batch completes", async () => {
    let runs = 0;
    const task = createCoalescedTask(async () => {
      runs += 1;
    });

    await task();
    await task();

    expect(runs).toBe(2);
  });
});
