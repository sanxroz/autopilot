import { AI_AGENTS, type AgentRunStatus, type AgentStatusEvent } from "../types";

export interface AgentNotification {
  readonly title: string;
  readonly body: string;
}

function agentName(agent: string | undefined): string {
  const name = AI_AGENTS.find((candidate) => candidate.id === agent)?.name;
  return name ? name.replace(/ CLI$/, "") : "Your agent";
}

function sessionName(worktreePath: string): string {
  return worktreePath.split("/").filter(Boolean).pop() ?? worktreePath;
}

export function getAgentNotification(
  previous: AgentRunStatus | undefined,
  event: Pick<AgentStatusEvent, "status" | "agent" | "worktreePath">,
  windowFocused: boolean,
): AgentNotification | null {
  if (windowFocused || previous === event.status) return null;
  const agent = agentName(event.agent);
  const session = sessionName(event.worktreePath);
  switch (event.status) {
    case "waiting_input":
      return { title: `${agent} needs your input`, body: `${session} is waiting for your reply` };
    case "completed":
      return { title: `${agent} finished`, body: `${session} is ready to review` };
    case "error":
      return { title: `${agent} hit an error`, body: `Open ${session} to see what went wrong` };
    default:
      return null;
  }
}

export async function sendAgentNotification({ title, body }: AgentNotification): Promise<void> {
  const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
  sendNotification({ title, body, sound: "default" });
}
