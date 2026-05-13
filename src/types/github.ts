export interface GitHubSettings {
  pollingIntervalMs: number;
  ghCliAvailable: boolean;
  ghAuthUser: string | null;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  pollingIntervalMs: 120000,
  ghCliAvailable: false,
  ghAuthUser: null,
};
