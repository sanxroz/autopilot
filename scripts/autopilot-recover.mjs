import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import readline from "node:readline/promises";
import process from "node:process";

const AUTOPILOT_EXECUTABLE_SUFFIX = "/Autopilot.app/Contents/MacOS/autopilot";
const BLOCKED_QUEUE_BYTES = 1_000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function parseProcessSnapshot(output) {
  return output
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      tpgid: Number(match[4]),
      state: match[5],
      tty: match[6],
      command: match[7],
    }));
}

function executableName(command) {
  const [executable = command, wrappedCommand] = command.trim().split(/\s+/);
  const name = path.basename(executable);
  if ((name === "bun" || name === "node") && wrappedCommand) {
    return path.basename(wrappedCommand);
  }
  return name;
}

function isAutopilotProcess(record) {
  const [executable = ""] = record.command.trim().split(/\s+/);
  return executable.endsWith(AUTOPILOT_EXECUTABLE_SUFFIX);
}

function isDescendant(records, pid, ancestorPid) {
  let current = pid;
  for (let depth = 0; depth < records.length; depth += 1) {
    if (current === ancestorPid) return true;
    const record = records.find((candidate) => candidate.pid === current);
    if (!record || record.ppid <= 0 || record.ppid === current) return false;
    current = record.ppid;
  }
  return false;
}

function foregroundProcess(records, shell) {
  if (shell.tpgid <= 0 || shell.tpgid === shell.pgid) return null;
  const group = records.filter(
    (record) => record.pgid === shell.tpgid && isDescendant(records, record.pid, shell.pid),
  );
  return group.find((record) => record.pid === shell.tpgid) ?? group[0] ?? null;
}

function readProcessCwd(pid) {
  try {
    const output = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1) ?? "";
  } catch {
    return "";
  }
}

export function findRecoverableSessions(records, getCwd = readProcessCwd) {
  const sessions = [];
  for (const app of records.filter(isAutopilotProcess)) {
    const shells = records.filter(
      (record) => record.ppid === app.pid && !record.state.startsWith("Z"),
    );
    for (const shell of shells) {
      const foreground = foregroundProcess(records, shell);
      if (!foreground) continue;
      sessions.push({
        appPid: app.pid,
        shellPid: shell.pid,
        tty: shell.tty,
        foregroundPid: foreground.pid,
        foregroundPgid: foreground.pgid,
        processName: executableName(foreground.command),
        worktreePath: getCwd(shell.pid),
      });
    }
  }
  return sessions.sort((left, right) =>
    left.worktreePath.localeCompare(right.worktreePath) || left.foregroundPid - right.foregroundPid
  );
}

function readQueuedInputBytes(ttys) {
  const safeTtys = [...new Set(ttys.filter((tty) => /^tty[a-zA-Z0-9]+$/.test(tty)))];
  if (safeTtys.length === 0) return new Map();

  const probe = `
import array, fcntl, json, os, sys, termios
result = {}
for tty in sys.argv[1:]:
    try:
        fd = os.open('/dev/' + tty, os.O_RDONLY | os.O_NONBLOCK | os.O_NOCTTY)
        queued = array.array('i', [0])
        fcntl.ioctl(fd, termios.FIONREAD, queued, True)
        os.close(fd)
        result[tty] = max(0, queued[0])
    except OSError:
        pass
print(json.dumps(result))
`;

  try {
    const output = execFileSync("python3", ["-c", probe, ...safeTtys], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Map(Object.entries(JSON.parse(output)));
  } catch {
    return new Map();
  }
}

export function addQueueDiagnostics(sessions, queuedBytesByTty) {
  return sessions
    .map((session) => ({
      ...session,
      queuedInputBytes: queuedBytesByTty.get(session.tty) ?? null,
    }))
    .sort((left, right) => {
      const leftBlocked = (left.queuedInputBytes ?? 0) >= BLOCKED_QUEUE_BYTES;
      const rightBlocked = (right.queuedInputBytes ?? 0) >= BLOCKED_QUEUE_BYTES;
      return Number(rightBlocked) - Number(leftBlocked) ||
        left.worktreePath.localeCompare(right.worktreePath) ||
        left.foregroundPid - right.foregroundPid;
    });
}

function readSnapshot() {
  const output = execFileSync(
    "ps",
    ["-axo", "pid=,ppid=,pgid=,tpgid=,state=,tty=,command="],
    { encoding: "utf8" },
  );
  return parseProcessSnapshot(output);
}

async function drainTerminalInput(tty) {
  if (!tty.startsWith("tty")) {
    throw new Error("The selected process has no recoverable terminal device.");
  }

  const flags = constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOCTTY;
  const terminal = await open(`/dev/${tty}`, flags);
  const buffer = Buffer.allocUnsafe(4096);
  const deadline = Date.now() + 10_000;
  let drainedBytes = 0;
  let idleRounds = 0;

  try {
    while (Date.now() < deadline && idleRounds < 20) {
      try {
        const { bytesRead } = await terminal.read(buffer, 0, buffer.length, null);
        if (bytesRead > 0) {
          drainedBytes += bytesRead;
          idleRounds = 0;
          continue;
        }
      } catch (error) {
        if (error?.code !== "EAGAIN" && error?.code !== "EWOULDBLOCK") throw error;
      }
      idleRounds += 1;
      await sleep(50);
    }
  } finally {
    await terminal.close();
  }

  if (idleRounds < 20) {
    throw new Error("Terminal input did not drain within 10 seconds; the shell remains paused.");
  }
  return drainedBytes;
}

function signalProcess(pid, signal, allowMissing = false) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (allowMissing && error?.code === "ESRCH") return;
    throw error;
  }
}

async function recoverSession(selected) {
  const current = findRecoverableSessions(readSnapshot()).find(
    (session) =>
      session.appPid === selected.appPid &&
      session.shellPid === selected.shellPid &&
      session.foregroundPid === selected.foregroundPid &&
      session.foregroundPgid === selected.foregroundPgid,
  );
  if (!current) {
    throw new Error("The foreground process changed. Run `autopilot recover` again.");
  }

  signalProcess(current.shellPid, "SIGSTOP");
  const resumeAndExit = (exitCode) => {
    signalProcess(current.shellPid, "SIGCONT", true);
    process.exit(exitCode);
  };
  const handleInterrupt = () => resumeAndExit(130);
  const handleTerminate = () => resumeAndExit(143);
  process.once("SIGINT", handleInterrupt);
  process.once("SIGTERM", handleTerminate);
  let resumeShell = true;
  try {
    signalProcess(-current.foregroundPgid, "SIGTERM", true);
    await sleep(500);
    signalProcess(-current.foregroundPgid, "SIGKILL", true);
    const drainedBytes = await drainTerminalInput(current.tty);
    return { ...current, drainedBytes };
  } catch (error) {
    resumeShell = false;
    throw new Error(
      `${error.message ?? error} Shell PID ${current.shellPid} remains paused; ` +
      `run \`kill -CONT ${current.shellPid}\` after checking its input.`,
    );
  } finally {
    process.removeListener("SIGINT", handleInterrupt);
    process.removeListener("SIGTERM", handleTerminate);
    if (resumeShell) signalProcess(current.shellPid, "SIGCONT", true);
  }
}

function printSessions(sessions) {
  if (sessions.length === 0) {
    console.log("No foreground agents are running in Autopilot terminals.");
    return;
  }
  for (const [index, session] of sessions.entries()) {
    const worktree = session.worktreePath || "Unknown worktree";
    const queuedBytes = session.queuedInputBytes;
    const queueStatus = queuedBytes >= BLOCKED_QUEUE_BYTES
      ? ` — BLOCKED (${queuedBytes.toLocaleString()} queued bytes)`
      : queuedBytes > 0
        ? ` — ${queuedBytes.toLocaleString()} queued bytes`
        : "";
    console.log(`${index + 1}. ${session.processName} (PID ${session.foregroundPid})${queueStatus}`);
    console.log(`   ${worktree}`);
  }
}

function printUsage() {
  console.log(`Usage:
  autopilot recover
  autopilot recover --list

Full input queues are labelled BLOCKED and sorted first. The interactive command
ends one foreground agent, drains blocked terminal input,
and keeps every other Autopilot terminal running.`);
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("Terminal recovery currently supports macOS only.");
  }
  const [argument] = process.argv.slice(2);
  if (argument === "--help" || argument === "-h" || argument === "help") {
    printUsage();
    return;
  }

  const discoveredSessions = findRecoverableSessions(readSnapshot());
  const queueDepths = readQueuedInputBytes(discoveredSessions.map((session) => session.tty));
  const sessions = addQueueDiagnostics(discoveredSessions, queueDepths);
  printSessions(sessions);
  if (argument === "--list" || sessions.length === 0) return;
  if (argument) throw new Error(`Unknown recover option: ${argument}`);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive recovery requires a terminal. Use `autopilot recover --list` to inspect.");
  }

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question("Select a process number to recover, or q to cancel: ")).trim();
    if (answer.toLowerCase() === "q" || answer === "") return;
    const index = Number(answer) - 1;
    const selected = sessions[index];
    if (!selected) throw new Error("That process number is not in the list.");
    const confirmation = (await prompt.question(`Type ${selected.foregroundPid} to confirm: `)).trim();
    if (confirmation !== String(selected.foregroundPid)) {
      console.log("Recovery cancelled.");
      return;
    }

    const recovered = await recoverSession(selected);
    console.log(
      `Recovered ${recovered.worktreePath || "terminal"}: ended ${recovered.processName} ` +
      `(PID ${recovered.foregroundPid}) and drained ${recovered.drainedBytes} input bytes.`,
    );
  } finally {
    prompt.close();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`autopilot recover: ${error.message ?? error}`);
    process.exitCode = 1;
  });
}
