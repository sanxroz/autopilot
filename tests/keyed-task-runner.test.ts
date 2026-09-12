import { describe, expect, test } from "bun:test";
import { createKeyedTaskRunner } from "../src/lib/keyed-task-runner";

describe("createKeyedTaskRunner", () => {
  test("keeps a task active by key until it completes", async () => {
    let release: (() => void) | undefined;
    let runs = 0;
    const runner = createKeyedTaskRunner();
    const task = async () => {
      runs += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    const first = runner.run("repo:42", task);
    const duplicate = runner.run("repo:42", task);

    expect(runner.has("repo:42")).toBe(true);
    expect(duplicate).toBe(first);
    expect(runs).toBe(1);

    release?.();
    await first;

    expect(runner.has("repo:42")).toBe(false);
  });
});
