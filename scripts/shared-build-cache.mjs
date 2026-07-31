import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { realpathSync } from "node:fs";

function cacheRoot() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "Autopilot");
  }

  return join(homedir(), ".cache", "autopilot");
}

function repositoryKey(cwd) {
  const commonDir = execFileSync(
    "git",
    ["rev-parse", "--git-common-dir"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  const resolvedCommonDir = isAbsolute(commonDir)
    ? commonDir
    : resolve(cwd, commonDir);
  const repositoryPath = realpathSync(
    basename(resolvedCommonDir) === ".git"
      ? dirname(resolvedCommonDir)
      : resolvedCommonDir,
  );

  return createHash("sha256").update(repositoryPath).digest("hex").slice(0, 16);
}

export function configureSharedCargoTarget(env, cwd = process.cwd()) {
  if (env.CARGO_TARGET_DIR) {
    return env;
  }

  if (env.AUTOPILOT_CARGO_TARGET_DIR) {
    env.CARGO_TARGET_DIR = env.AUTOPILOT_CARGO_TARGET_DIR;
    return env;
  }

  try {
    env.CARGO_TARGET_DIR = join(cacheRoot(), "cargo-target", repositoryKey(cwd));
  } catch {
    // Keep Cargo's default target directory when the command is outside a Git repository.
  }

  return env;
}
