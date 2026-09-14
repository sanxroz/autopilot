import { describe, expect, test } from "bun:test";

const tooltipLabels = [
  "Return to pull request board",
  "View this pull request on GitHub",
  "Review previous changed file",
  "Review next changed file",
  "PR actions",
  "Dismiss image preview",
  "Manage reviewers",
  "Preview current work",
  "Modify current work notes",
  "Dismiss settings panel",
  "Refresh diagnostics",
  "Toggle captain terminal",
  "Toggle Git, PR, and notes panel",
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
  "Add a repository to Spaces",
  "New session",
  "Space actions",
  "Keyboard shortcuts",
  "Choose an application for this workspace",
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

    for (const label of [
      "in GitHub",
      "Sidebar",
      "Command menu",
      "Finishing merge on GitHub",
      "Merge via GitHub",
    ]) {
      expect(combinedSource).toMatch(
        new RegExp(`<Tooltip[^>]*content=\\{[^>]*${label}`),
      );
    }

    const sidebarSource =
      sources[targetFiles.indexOf("src/components/Sidebar.tsx")];
    expect(sidebarSource).toMatch(
      /<Tooltip\s+content=\{[^}]+\}\s+side="right">\s*<button[^>]*data-space-path=/,
    );

    const toolbarSource =
      sources[targetFiles.indexOf("src/components/RightPanelToolbar.tsx")];
    expect(toolbarSource).toMatch(
      /<Tooltip\s+key=\{[^}]+\}\s+content=\{[^}]+\}>\s*<button[^>]*role="tab"/,
    );
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
