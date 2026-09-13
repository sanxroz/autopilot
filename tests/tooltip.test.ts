import { describe, expect, test } from "bun:test";

const tooltipLabels = [
  "Back to board",
  "Open in GitHub",
  "Previous file",
  "Next file",
  "PR actions",
  "Close image",
  "Manage reviewers",
  "Preview current work",
  "Edit current work",
  "Close settings",
  "Refresh diagnostics",
];

const targetFiles = [
  "src/components/PRDetailView.tsx",
  "src/components/PRDetailView/PRDiffPanel.tsx",
  "src/components/PRDetailView/PRMetadataSidebar.tsx",
  "src/components/RightPanel/CommentsTab.tsx",
  "src/components/RightPanel/NotesTab.tsx",
  "src/components/SettingsPanel.tsx",
  "src/components/Sidebar.tsx",
  "src/components/WorkspaceHeader.tsx",
  "src/components/RightPanelToolbar.tsx",
];

const navigationTooltips = [
  "Add Space",
  "New session",
  "Space actions",
  "Keyboard shortcuts",
  "Open workspace with another application",
];

describe("designed tooltips", () => {
  test("use the shared component instead of native title attributes", async () => {
    const sources = await Promise.all(
      targetFiles.map((path) => Bun.file(path).text()),
    );
    const combinedSource = sources.join("\n");

    for (const label of tooltipLabels) {
      expect(combinedSource).toContain(`<Tooltip content="${label}">`);
      expect(combinedSource).not.toContain(`title="${label}"`);
    }

    expect(combinedSource).toContain(
      '<Tooltip content={themeMode === "dark" ? "Light theme" : "Dark theme"}>',
    );

    for (const label of navigationTooltips) {
      expect(combinedSource).toContain(`content="${label}"`);
      expect(combinedSource).not.toContain(`title="${label}"`);
    }

    expect(combinedSource).toContain("<Tooltip content={space.repoName}");
    expect(combinedSource).toContain("<Tooltip key={tab.id} content={tooltip}>");
    expect(combinedSource).toContain("Open ${activeRepoGroup.repoName} captain terminal");
    expect(combinedSource).toContain("Open #${prStatus.number} in GitHub");
    expect(combinedSource).toContain('"Hide" : "Show"} sidebar');
    expect(combinedSource).toContain("Command menu (${formatShortcut(commandMenuShortcut)})");
    expect(combinedSource).toContain('"Close workspace panel" : "Open Git changes"');
  });

  test("uses app theme tokens and reduced-motion-safe styling", async () => {
    const source = await Bun.file("src/components/ui/tooltip.tsx").text();

    expect(source).toContain("bg-solid");
    expect(source).toContain("text-primary");
    expect(source).toContain("border-border-strong");
    expect(source).toContain("motion-reduce:animate-none");
    expect(source).not.toContain("TooltipPrimitive.Arrow");
  });
});
