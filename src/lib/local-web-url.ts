const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const WEB_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const ANSI_ESCAPE_PATTERN = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~])/g;

export function isLocalWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function findLocalWebUrls(value: string): string[] {
  const matches = value.replace(ANSI_ESCAPE_PATTERN, "").match(WEB_URL_PATTERN) ?? [];
  return [...new Set(matches
    .map((match) => match.replace(/[),.;!?\]}]+$/, ""))
    .filter(isLocalWebUrl)
    .map((match) => new URL(match).href))];
}
