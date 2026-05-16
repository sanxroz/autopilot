export interface GitHubSettings {
  ghCliAvailable: boolean;
  ghAuthUser: string | null;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  ghCliAvailable: false,
  ghAuthUser: null,
};
