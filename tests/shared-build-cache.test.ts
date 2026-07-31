import { describe, expect, test } from "bun:test";
import { configureSharedCargoTarget } from "../scripts/shared-build-cache.mjs";

describe("shared build cache", () => {
  test("preserves an explicitly configured Cargo target directory", () => {
    const env = { CARGO_TARGET_DIR: "/tmp/custom-cargo-target" };

    configureSharedCargoTarget(env, process.cwd());

    expect(env.CARGO_TARGET_DIR).toBe("/tmp/custom-cargo-target");
  });

  test("assigns a repository-scoped cache outside the worktree", () => {
    const env: Record<string, string> = {};

    configureSharedCargoTarget(env, process.cwd());

    expect(env.CARGO_TARGET_DIR).toMatch(/[\\/]cargo-target[\\/][a-f0-9]{16}$/);
  });
});
