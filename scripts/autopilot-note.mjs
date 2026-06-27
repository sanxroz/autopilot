import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const STORE_FILENAME = "autopilot-settings.json";
const LEGACY_NOTE_KEY = "sidebarNotesMarkdown";
const NOTES_KEY = "sidebarNotesByWorktreePath";

function getSettingsPath() {
  const home = os.homedir();

  if (process.env.AUTOPILOT_SETTINGS_PATH) {
    return process.env.AUTOPILOT_SETTINGS_PATH;
  }

  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "com.autopilot.app", STORE_FILENAME);
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "com.autopilot.app", STORE_FILENAME);
    default:
      return path.join(home, ".local", "share", "com.autopilot.app", STORE_FILENAME);
  }
}

function normalizeWorktreePath(worktreePath) {
  return path.resolve(worktreePath);
}

function detectCurrentWorktreePath() {
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const resolved = output.trim();
    return resolved || process.cwd();
  } catch {
    return process.cwd();
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readSettingsFile(settingsPath) {
  try {
    const raw = await readFile(settingsPath, "utf8");
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${settingsPath}`);
    }

    throw error;
  }
}

async function writeSettingsFile(settingsPath, data) {
  const directory = path.dirname(settingsPath);
  const tempPath = path.join(directory, `${path.basename(settingsPath)}.${process.pid}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);
}

function parseArgs(argv) {
  const args = {
    command: "",
    worktreePath: "",
    text: "",
    useStdin: false,
  };

  const [command, ...rest] = argv;
  if (!command) {
    return args;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    args.command = "help";
    return args;
  }

  args.command = command;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--worktree" || arg === "-w") {
      args.worktreePath = rest[++index] ?? "";
      continue;
    }

    if (arg === "--text" || arg === "-t") {
      args.text = rest[++index] ?? "";
      continue;
    }

    if (arg === "--stdin") {
      args.useStdin = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      args.command = "help";
      return args;
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  bun run note -- get [--worktree <path>]
  bun run note -- set [--worktree <path>] --text <markdown>
  bun run note -- set [--worktree <path>] --stdin < markdown.txt>
  bun run note -- clear [--worktree <path>]`);
}

async function main() {
  const { command, worktreePath, text, useStdin } = parseArgs(process.argv.slice(2));
  const settingsPath = getSettingsPath();

  if (!command || command === "help") {
    printUsage();
    return;
  }

  const normalizedWorktreePath = normalizeWorktreePath(worktreePath || detectCurrentWorktreePath());
  const settings = await readSettingsFile(settingsPath);
  const sidebarNotesByWorktreePath = isRecord(settings[NOTES_KEY]) ? { ...settings[NOTES_KEY] } : {};

  if (command === "get") {
    process.stdout.write(`${sidebarNotesByWorktreePath[normalizedWorktreePath] ?? ""}`);
    return;
  }

  if (command === "clear") {
    delete sidebarNotesByWorktreePath[normalizedWorktreePath];
    settings[NOTES_KEY] = sidebarNotesByWorktreePath;
    delete settings[LEGACY_NOTE_KEY];
    await writeSettingsFile(settingsPath, settings);
    return;
  }

  if (command !== "set") {
    throw new Error(`Unknown command: ${command}`);
  }

  const noteText = useStdin ? readFileSync(0, "utf8") : text;
  sidebarNotesByWorktreePath[normalizedWorktreePath] = noteText;
  settings[NOTES_KEY] = sidebarNotesByWorktreePath;
  delete settings[LEGACY_NOTE_KEY];
  await writeSettingsFile(settingsPath, settings);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
