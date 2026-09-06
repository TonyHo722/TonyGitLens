import * as vscode from 'vscode';
import * as path from 'path';
import { GitCliService } from './services/gitCliService';
import { WorktreeTreeDataProvider } from './providers/worktreeTreeDataProvider';
import { BranchCompareTreeDataProvider } from './providers/branchCompareTreeDataProvider';
import { CommitContentProvider } from './providers/commitContentProvider';
import { WorktreeItem } from './tree/worktreeItem';
import { CommitItem } from './tree/commitItem';
import { CommitFileItem } from './tree/commitFileItem';
import { CompareFileItem } from './tree/compareFileItem';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('TonyGitLens');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Activating TonyGitLens extension...');

  // Initialize services and providers
  const gitService = new GitCliService();
  const treeDataProvider = new WorktreeTreeDataProvider(gitService);
  const compareTreeDataProvider = new BranchCompareTreeDataProvider(gitService);
  const contentProvider = new CommitContentProvider(gitService);

  async function getActiveRepoRoot(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }
    return await gitService.getRepoRoot(workspaceFolders[0].uri.fsPath);
  }

  // Register Virtual Document Content Provider for Diffs
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      CommitContentProvider.SCHEME,
      contentProvider
    )
  );

  // Register Tree Views (Activity Bar and Source Control view)
  const worktreesView = vscode.window.createTreeView('tonygitlens.worktreesView', {
    treeDataProvider,
    showCollapseAll: true,
  });

  const compareView = vscode.window.createTreeView('tonygitlens.compareView', {
    treeDataProvider: compareTreeDataProvider,
    showCollapseAll: true,
  });

  const scmView = vscode.window.createTreeView('tonygitlens.worktreesViewScm', {
    treeDataProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(worktreesView, compareView, scmView);

  // Command: Refresh Worktrees
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
        leftUri = CommitContentProvider.toEmptyUri(change.path);
        rightUri = CommitContentProvider.toUri(change.worktreePath, change.commitHash, change.path);
      } else if (change.status === 'D') {
        leftUri = CommitContentProvider.toUri(
          change.worktreePath,
          parentHash || `${change.commitHash}^`,
          change.path
        );
        rightUri = CommitContentProvider.toEmptyUri(change.path);
      } else {
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

  // Command: Compare Worktree Branch (1-Selection GitLens flow)
  const compareWorktreeBranchCmd = vscode.commands.registerCommand(
    'tonygitlens.compareWorktreeBranch',
    async (item?: WorktreeItem) => {
      const repoRoot = (item?.worktreePath ? await gitService.getRepoRoot(item.worktreePath) : undefined) ||
        (await getActiveRepoRoot());

      if (!repoRoot) {
        vscode.window.showErrorMessage('No active Git repository found.');
        return;
      }

      const baseBranch = item?.worktree.branch || 'main';
      const branches = await gitService.getBranches(repoRoot);
      const targetOptions = branches
        .filter((b) => b.name !== baseBranch)
        .map((b) => ({
          label: b.name,
          description: b.isRemote ? '(remote)' : b.isCurrent ? '(current)' : '',
          iconPath: new vscode.ThemeIcon(b.isRemote ? 'cloud' : 'git-branch'),
        }));

      if (targetOptions.length === 0) {
        vscode.window.showInformationMessage(`No other branches found to compare with '${baseBranch}'.`);
        return;
      }

      const selected = await vscode.window.showQuickPick(targetOptions, {
        placeHolder: `Select branch to compare with '${baseBranch}'`,
      });

      if (!selected) {
        return;
      }

      const compareBranch = selected.label;
      outputChannel.appendLine(`Comparing branches: ${baseBranch} ↔ ${compareBranch}`);

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Comparing ${baseBranch} with ${compareBranch}...`,
          cancellable: false,
        },
        async () => {
          const comparison = await gitService.getBranchComparison(
            repoRoot,
            baseBranch,
            compareBranch
          );
          compareTreeDataProvider.setComparison(comparison);
        }
      );
    }
  );

  // Command: Compare Branches (Generic 2-step QuickPick)
  const compareBranchesCmd = vscode.commands.registerCommand(
    'tonygitlens.compareBranches',
    async () => {
      const repoRoot = await getActiveRepoRoot();
      if (!repoRoot) {
        vscode.window.showErrorMessage('No active Git repository found.');
        return;
      }

      const branches = await gitService.getBranches(repoRoot);
      if (branches.length < 2) {
        vscode.window.showInformationMessage('At least two branches are required for comparison.');
        return;
      }

      const baseOptions = branches.map((b) => ({
        label: b.name,
        description: b.isRemote ? '(remote)' : b.isCurrent ? '(current)' : '',
        iconPath: new vscode.ThemeIcon(b.isRemote ? 'cloud' : 'git-branch'),
      }));

      const basePick = await vscode.window.showQuickPick(baseOptions, {
        placeHolder: 'Select BASE branch (comparison reference)',
      });
      if (!basePick) return;

      const compareOptions = branches
        .filter((b) => b.name !== basePick.label)
        .map((b) => ({
          label: b.name,
          description: b.isRemote ? '(remote)' : b.isCurrent ? '(current)' : '',
          iconPath: new vscode.ThemeIcon(b.isRemote ? 'cloud' : 'git-branch'),
        }));

      const comparePick = await vscode.window.showQuickPick(compareOptions, {
        placeHolder: `Select TARGET branch to compare against '${basePick.label}'`,
      });
      if (!comparePick) return;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Comparing ${basePick.label} with ${comparePick.label}...`,
          cancellable: false,
        },
        async () => {
          const comparison = await gitService.getBranchComparison(
            repoRoot,
            basePick.label,
            comparePick.label
          );
          compareTreeDataProvider.setComparison(comparison);
        }
      );
    }
  );

  // Command: Swap Base and Target in Comparison
  const swapComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.swapComparison',
    async () => {
      const current = compareTreeDataProvider.getComparison();
      if (!current) {
        return;
      }

      outputChannel.appendLine(`Swapping comparison: ${current.compareBranch} ↔ ${current.baseBranch}`);
      const swapped = await gitService.getBranchComparison(
        current.repoRoot,
        current.compareBranch,
        current.baseBranch
      );
      compareTreeDataProvider.setComparison(swapped);
    }
  );

  // Command: Clear Comparison
  const clearComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.clearComparison',
    () => {
      compareTreeDataProvider.clearComparison();
    }
  );

  // Command: Refresh Comparison
  const refreshComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.refreshComparison',
    async () => {
      const current = compareTreeDataProvider.getComparison();
      if (current) {
        const refreshed = await gitService.getBranchComparison(
          current.repoRoot,
          current.baseBranch,
          current.compareBranch
        );
        compareTreeDataProvider.setComparison(refreshed);
      }
    }
  );

  // Command: Diff Compare File
  const diffCompareFileCmd = vscode.commands.registerCommand(
    'tonygitlens.diffCompareFile',
    async (item?: CompareFileItem) => {
      if (!item) {
        return;
      }

      const change = item.change;
      const fileName = path.basename(change.path);

      let leftUri: vscode.Uri;
      let rightUri: vscode.Uri;

      if (change.status === 'A') {
        leftUri = CommitContentProvider.toEmptyUri(change.path);
        rightUri = CommitContentProvider.toUri(change.repoRoot, change.compareRef, change.path);
      } else if (change.status === 'D') {
        leftUri = CommitContentProvider.toUri(change.repoRoot, change.baseRef, change.path);
        rightUri = CommitContentProvider.toEmptyUri(change.path);
      } else {
        const sourcePath = change.originalPath || change.path;
        leftUri = CommitContentProvider.toUri(change.repoRoot, change.baseRef, sourcePath);
        rightUri = CommitContentProvider.toUri(change.repoRoot, change.compareRef, change.path);
      }

      const title = `${fileName} (${change.baseRef} ↔ ${change.compareRef})`;
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
    compareTreeDataProvider.refresh();
  });

  context.subscriptions.push(
    refreshCmd,
    loadMoreCmd,
    copyShaCmd,
    openWorktreeCmd,
    revealCmd,
    diffCmd,
    compareWorktreeBranchCmd,
    compareBranchesCmd,
    swapComparisonCmd,
    clearComparisonCmd,
    refreshComparisonCmd,
    diffCompareFileCmd,
    workspaceFoldersWatcher
  );

  outputChannel.appendLine('TonyGitLens extension successfully initialized.');
}

export function deactivate() {}
