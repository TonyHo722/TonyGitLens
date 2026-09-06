import * as vscode from 'vscode';
import * as path from 'path';
import { GitCliService } from './services/gitCliService';
import { WorktreeTreeDataProvider } from './providers/worktreeTreeDataProvider';
import { CommitContentProvider } from './providers/commitContentProvider';
import { WorktreeItem } from './tree/worktreeItem';
import { CommitItem } from './tree/commitItem';
import { CommitFileItem } from './tree/commitFileItem';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('TonyGitLens');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Activating TonyGitLens extension...');

  // Initialize services and providers
  const gitService = new GitCliService();
  const treeDataProvider = new WorktreeTreeDataProvider(gitService);
  const contentProvider = new CommitContentProvider(gitService);

  // Register Virtual Document Content Provider for Diffs
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      CommitContentProvider.SCHEME,
      contentProvider
    )
  );

  // Register Tree Views (Activity Bar and Source Control view)
  const activityBarView = vscode.window.createTreeView('tonygitlens.worktreesView', {
    treeDataProvider,
    showCollapseAll: true,
  });

  const scmView = vscode.window.createTreeView('tonygitlens.worktreesViewScm', {
    treeDataProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(activityBarView, scmView);

  // Command: Refresh
  const refreshCmd = vscode.commands.registerCommand('tonygitlens.refresh', () => {
    outputChannel.appendLine('Refreshing worktrees...');
    treeDataProvider.refresh();
  });

  // Command: Load More Commits
  const loadMoreCmd = vscode.commands.registerCommand(
    'tonygitlens.loadMoreCommits',
    (worktreePath: string) => {
      if (worktreePath) {
        outputChannel.appendLine(`Loading more commits for: ${worktreePath}`);
        treeDataProvider.loadMore(worktreePath);
      }
    }
  );

  // Command: Copy Commit SHA
  const copyShaCmd = vscode.commands.registerCommand(
    'tonygitlens.copyCommitSha',
    async (item?: CommitItem) => {
      const hash = item?.commitHash;
      if (hash) {
        await vscode.env.clipboard.writeText(hash);
        vscode.window.showInformationMessage(`Copied Commit SHA: ${hash.substring(0, 7)}`);
      }
    }
  );

  // Command: Open Worktree in New Window
  const openWorktreeCmd = vscode.commands.registerCommand(
    'tonygitlens.openWorktree',
    async (item?: WorktreeItem) => {
      const wtPath = item?.worktreePath;
      if (wtPath) {
        outputChannel.appendLine(`Opening worktree in new window: ${wtPath}`);
        const uri = vscode.Uri.file(wtPath);
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
      }
    }
  );

  // Command: Reveal Worktree in File Explorer
  const revealCmd = vscode.commands.registerCommand(
    'tonygitlens.revealInFileExplorer',
    async (item?: WorktreeItem) => {
      const wtPath = item?.worktreePath;
      if (wtPath) {
        const uri = vscode.Uri.file(wtPath);
        await vscode.commands.executeCommand('revealFileInOS', uri);
      }
    }
  );

  // Command: Diff Commit File
  const diffCmd = vscode.commands.registerCommand(
    'tonygitlens.diffCommitFile',
    async (item?: CommitFileItem) => {
      if (!item) {
        return;
      }

      const change = item.change;
      const fileName = path.basename(change.path);
      const shortSha = change.commitHash.substring(0, 7);
      const parentHash = item.parentHash;
      const parentShort = parentHash ? parentHash.substring(0, 7) : 'empty';

      let leftUri: vscode.Uri;
      let rightUri: vscode.Uri;

      if (change.status === 'A') {
        // Newly added file: compare empty against current commit revision
        leftUri = CommitContentProvider.toEmptyUri(change.path);
        rightUri = CommitContentProvider.toUri(change.worktreePath, change.commitHash, change.path);
      } else if (change.status === 'D') {
        // Deleted file: compare parent revision against empty
        leftUri = CommitContentProvider.toUri(
          change.worktreePath,
          parentHash || `${change.commitHash}^`,
          change.path
        );
        rightUri = CommitContentProvider.toEmptyUri(change.path);
      } else {
        // Modified or Renamed file
        const sourcePath = change.originalPath || change.path;
        leftUri = parentHash
          ? CommitContentProvider.toUri(change.worktreePath, parentHash, sourcePath)
          : CommitContentProvider.toEmptyUri(sourcePath);
        rightUri = CommitContentProvider.toUri(change.worktreePath, change.commitHash, change.path);
      }

      const title = `${fileName} (${parentShort} ↔ ${shortSha})`;
      try {
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
          preview: true,
        });
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open diff: ${err.message}`);
      }
    }
  );

  // Auto-refresh when workspace folders change
  const workspaceFoldersWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    treeDataProvider.refresh();
  });

  context.subscriptions.push(
    refreshCmd,
    loadMoreCmd,
    copyShaCmd,
    openWorktreeCmd,
    revealCmd,
    diffCmd,
    workspaceFoldersWatcher
  );

  outputChannel.appendLine('TonyGitLens extension successfully initialized.');
}

export function deactivate() {}
