import * as React from "react";
import { Search, FolderPlus, Plus, GitCompare, Settings, Sun, Moon, GitBranch } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import * as CommandMenuUI from "./ui/command-menu";
import { useTheme, useThemeMode } from "../hooks/useTheme";
import { useAppStore } from "../store";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open: isOpen, onOpenChange }: CommandMenuProps) {
  const theme = useTheme();
  const themeMode = useThemeMode();
  const [search, setSearch] = React.useState("");

  const repositories = useAppStore((state) => state.repositories);
  const addRepository = useAppStore((state) => state.addRepository);
  const selectWorktree = useAppStore((state) => state.selectWorktree);
  const toggleCodeReview = useAppStore((state) => state.toggleCodeReview);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const createWorktreeAuto = useAppStore((state) => state.createWorktreeAuto);

  const allWorktrees = React.useMemo(() => {
    return repositories.flatMap((repo) =>
      repo.worktrees
        .filter((wt) => wt.name !== "main")
        .map((wt) => ({
          ...wt,
          repoName: repo.info.name,
          repoPath: repo.info.path,
        }))
    );
  }, [repositories]);

  React.useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  const handleAddRepository = async () => {
    onOpenChange(false);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });
      if (selected) {
        await addRepository(selected as string);
      }
    } catch (e) {
      console.error("Failed to add repository:", e);
    }
  };

  const handleNewWorkspace = async () => {
    onOpenChange(false);
    if (repositories.length > 0) {
      const created = await createWorktreeAuto(repositories[0].info.path);
      if (created) {
        await selectWorktree(created);
      }
    }
  };

  const handleToggleCodeReview = () => {
    onOpenChange(false);
    toggleCodeReview();
  };

  const handleOpenSettings = () => {
    onOpenChange(false);
    toggleSettings();
  };

  const handleToggleTheme = () => {
    onOpenChange(false);
    setThemeMode(themeMode === "dark" ? "light" : "dark");
  };

  const handleSelectWorktree = async (worktree: typeof allWorktrees[0]) => {
    onOpenChange(false);
    await selectWorktree(worktree);
  };

  return (
    <CommandMenuUI.Dialog open={isOpen} onOpenChange={onOpenChange}>
      <div
        className="group/cmd-input flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${theme.border.subtle}` }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: theme.text.tertiary }} />
        <CommandMenuUI.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search commands..."
          style={{ color: theme.text.primary }}
        />
      </div>

      <CommandMenuUI.List className="max-h-80 overflow-y-auto" style={{ background: theme.bg.secondary }}>
        {allWorktrees.length > 0 && (
          <CommandMenuUI.Group heading="Workspaces">
            {allWorktrees.map((wt) => {
              const isCurrentWorktree = selectedWorktree?.path === wt.path;
              return (
                <CommandMenuUI.Item
                  key={wt.path}
                  onSelect={() => handleSelectWorktree(wt)}
                  style={{ color: theme.text.primary }}
                  className={isCurrentWorktree ? "!bg-[var(--item-active-bg)]" : ""}
                  data-active={isCurrentWorktree}
                >
                  <CommandMenuUI.ItemIcon as={GitBranch} style={{ color: theme.text.tertiary }} />
                  <div className="flex flex-col">
                    <span>{wt.branch || wt.name}</span>
                    <span className="text-xs" style={{ color: theme.text.tertiary }}>
                      {wt.repoName}
                    </span>
                  </div>
                </CommandMenuUI.Item>
              );
            })}
          </CommandMenuUI.Group>
        )}

        <CommandMenuUI.Group heading="Actions">
          <CommandMenuUI.Item onSelect={handleAddRepository} style={{ color: theme.text.primary }}>
            <CommandMenuUI.ItemIcon as={FolderPlus} style={{ color: theme.text.tertiary }} />
            Add Repository
          </CommandMenuUI.Item>
          <CommandMenuUI.Item onSelect={handleNewWorkspace} style={{ color: theme.text.primary }}>
            <CommandMenuUI.ItemIcon as={Plus} style={{ color: theme.text.tertiary }} />
            New Workspace
          </CommandMenuUI.Item>
        </CommandMenuUI.Group>

        <CommandMenuUI.Group heading="Navigation">
          <CommandMenuUI.Item onSelect={handleToggleCodeReview} style={{ color: theme.text.primary }}>
            <CommandMenuUI.ItemIcon as={GitCompare} style={{ color: theme.text.tertiary }} />
            Toggle Code Review
          </CommandMenuUI.Item>
          <CommandMenuUI.Item onSelect={handleOpenSettings} style={{ color: theme.text.primary }}>
            <CommandMenuUI.ItemIcon as={Settings} style={{ color: theme.text.tertiary }} />
            Open Settings
          </CommandMenuUI.Item>
        </CommandMenuUI.Group>

        <CommandMenuUI.Group heading="Theme">
          <CommandMenuUI.Item onSelect={handleToggleTheme} style={{ color: theme.text.primary }}>
            <CommandMenuUI.ItemIcon
              as={themeMode === "dark" ? Sun : Moon}
              style={{ color: theme.text.tertiary }}
            />
            Switch to {themeMode === "dark" ? "Light" : "Dark"} Mode
          </CommandMenuUI.Item>
        </CommandMenuUI.Group>
      </CommandMenuUI.List>

      <CommandMenuUI.Footer
        className="text-xs"
        style={{
          borderTop: `1px solid ${theme.border.subtle}`,
          color: theme.text.tertiary,
        }}
      >
        <span>Type to search</span>
        <div className="flex items-center gap-2">
          <CommandMenuUI.FooterKeyBox
            style={{
              background: theme.bg.hover,
              color: theme.text.secondary,
            }}
          >
            <span className="text-[10px]">esc</span>
          </CommandMenuUI.FooterKeyBox>
          <span>to close</span>
        </div>
      </CommandMenuUI.Footer>
    </CommandMenuUI.Dialog>
  );
}
