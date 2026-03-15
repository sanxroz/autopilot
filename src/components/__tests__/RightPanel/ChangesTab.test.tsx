import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChangesTab } from '../../RightPanel/ChangesTab';
import type { ChangedFile, FileDiffData } from '../../../types';

const changedFiles: ChangedFile[] = [
  {
    path: 'src/App.tsx',
    status: 'modified',
    additions: 2,
    deletions: 1,
  },
  {
    path: 'README.md',
    status: 'added',
    additions: 3,
    deletions: 0,
  },
];

const fileDiff: FileDiffData = {
  path: 'src/App.tsx',
  patch: '@@ -1 +1,2 @@\n-export const App = () => null;\n+export const App = () => <div />;\n+console.log("changed")',
};

describe('ChangesTab', () => {
  it('renders an empty state when no files are changed', () => {
    render(
      <ChangesTab
        changedFiles={[]}
        selectedFile={null}
        fileDiff={null}
        isLoading={false}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByText('No changes detected')).toBeTruthy();
  });

  it('renders changed files and selects a file on click', () => {
    const onSelectFile = vi.fn();

    render(
      <ChangesTab
        changedFiles={changedFiles}
        selectedFile={null}
        fileDiff={null}
        isLoading={false}
        onSelectFile={onSelectFile}
      />,
    );

    fireEvent.click(screen.getByLabelText(/App.tsx, modified, 2 additions, 1 deletions/i));

    expect(screen.getByText('README.md')).toBeTruthy();
    expect(onSelectFile).toHaveBeenCalledWith('src/App.tsx');
  });

  it('supports keyboard selection', () => {
    const onSelectFile = vi.fn();

    render(
      <ChangesTab
        changedFiles={changedFiles}
        selectedFile={null}
        fileDiff={null}
        isLoading={false}
        onSelectFile={onSelectFile}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText(/README.md, added, 3 additions, 0 deletions/i), {
      key: 'Enter',
    });

    expect(onSelectFile).toHaveBeenCalledWith('README.md');
  });

  it('renders the parsed diff for the selected file', () => {
    render(
      <ChangesTab
        changedFiles={changedFiles}
        selectedFile="src/App.tsx"
        fileDiff={fileDiff}
        isLoading={false}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByText('@@ -1 +1,2 @@')).toBeTruthy();
    expect(screen.getByText('export const App = () => null;')).toBeTruthy();
    expect(screen.getByText('console.log("changed")')).toBeTruthy();
  });

  it('shows a loading placeholder while waiting for the selected file diff', () => {
    render(
      <ChangesTab
        changedFiles={changedFiles}
        selectedFile="src/App.tsx"
        fileDiff={null}
        isLoading={false}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading diff...')).toBeTruthy();
  });
});
