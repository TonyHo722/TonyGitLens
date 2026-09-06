import * as vscode from 'vscode';
import * as path from 'path';
import { GitCliService } from './services/gitCliService';
import { WorktreeTreeDataProvider } from './providers/worktreeTreeDataProvider';
import { BranchCompareTreeDataProvider } from './providers/branchCompareTreeDataProvider';
import { CommitContentProvider } from './providers/commitContentProvider';
import { WorktreeItem } from './tree/worktreeItem';
import { WorktreeCompareItem } from './tree/worktreeCompareItem';
import { CompareRootItem } from './tree/compareRootItem';
import { CompareSectionItem } from './tree/compareSectionItem';
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

  // Helper to extract branch name from any tree item or argument
  function resolveBranchName(item?: any): string | undefined {
    if (!item) {
      return undefined;
    }
    if (item instanceof WorktreeCompareItem) {
      return item.branchName;
    }
    if (item instanceof WorktreeItem) {
      return item.worktree.branch || path.basename(item.worktreePath);
    }
    if (item instanceof CompareSectionItem) {
      return item.comparison.baseBranch;
    }
    if (item instanceof CompareRootItem) {
      return item.comparison.baseBranch;
    }
    if (typeof item === 'string') {
      return item;
    }
    if (item.worktreeItem instanceof WorktreeItem) {
      return item.worktreeItem.worktree.branch || path.basename(item.worktreeItem.worktreePath);
    }
    if (item.worktree?.branch) {
      return item.worktree.branch;
    }
    if (item.comparison?.baseBranch) {
      return item.comparison.baseBranch;
    }
    return undefined;
  }

  // Clear comparison for a specific branch (or prompt if run without args)
  async function handleClearBranchComparison(item?: any): Promise<void> {
    const branchName = resolveBranchName(item);

    if (branchName) {
      if (!treeDataProvider.hasWorktreeComparison(branchName)) {
        vscode.window.showInformationMessage(`No active comparison found for branch '${branchName}'.`);
        return;
      }
      treeDataProvider.clearWorktreeComparison(branchName);
      outputChannel.appendLine(`Cleared comparison for branch: ${branchName}`);

      const currentGlobal = compareTreeDataProvider.getComparison();
      if (currentGlobal && currentGlobal.baseBranch === branchName) {
        compareTreeDataProvider.clearComparison();
      }

      vscode.window.showInformationMessage(`TonyGitLens: Cleared comparison for '${branchName}'`);
      return;
    }

    // Interactive picker if called without item (e.g. from Command Palette)
    const activeComparisons = treeDataProvider.getActiveComparisons();
    if (activeComparisons.size === 0) {
      vscode.window.showInformationMessage('No active branch comparisons to clear.');
      return;
    }

    if (activeComparisons.size === 1) {
      const [singleBranch] = Array.from(activeComparisons.keys());
      treeDataProvider.clearWorktreeComparison(singleBranch);
      outputChannel.appendLine(`Cleared comparison for branch: ${singleBranch}`);
      const currentGlobal = compareTreeDataProvider.getComparison();
      if (currentGlobal && currentGlobal.baseBranch === singleBranch) {
        compareTreeDataProvider.clearComparison();
      }
      vscode.window.showInformationMessage(`TonyGitLens: Cleared comparison for '${singleBranch}'`);
      return;
    }

    interface ClearPickItem extends vscode.QuickPickItem {
      branch?: string;
      clearAll?: boolean;
    }

    const picks: ClearPickItem[] = [];
    for (const [branch, comp] of activeComparisons.entries()) {
      picks.push({
        label: `$(git-compare) ${branch}`,
        description: `compared with '${comp.compareBranch}'`,
        branch,
      });
    }
    picks.push({
      label: '$(clear-all) Clear All Branch Comparisons',
      description: `Clear all ${activeComparisons.size} active comparisons`,
      clearAll: true,
    });

    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Select a branch comparison to clear',
    });

    if (!selected) {
      return;
    }

    if (selected.clearAll) {
      treeDataProvider.clearWorktreeComparison();
      compareTreeDataProvider.clearComparison();
      vscode.window.showInformationMessage('TonyGitLens: Cleared all branch comparisons.');
      outputChannel.appendLine('Cleared all branch comparisons.');
    } else if (selected.branch) {
      treeDataProvider.clearWorktreeComparison(selected.branch);
      outputChannel.appendLine(`Cleared comparison for branch: ${selected.branch}`);
      const currentGlobal = compareTreeDataProvider.getComparison();
      if (currentGlobal && currentGlobal.baseBranch === selected.branch) {
        compareTreeDataProvider.clearComparison();
      }
      vscode.window.showInformationMessage(`TonyGitLens: Cleared comparison for '${selected.branch}'`);
    }
  }

  // Swap comparison base and target
  async function handleSwapBranchComparison(item?: any): Promise<void> {
    const branchName = resolveBranchName(item);
    let comparison = branchName
      ? treeDataProvider.getWorktreeComparison(branchName)
      : compareTreeDataProvider.getComparison();

    if (!comparison) {
      vscode.window.showInformationMessage('No active branch comparison to swap.');
      return;
    }

    const currentBase = comparison.baseBranch;
    const currentCompare = comparison.compareBranch;
    outputChannel.appendLine(`Swapping comparison for '${currentBase}': ${currentCompare} ↔ ${currentBase}`);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Swapping comparison: ${currentCompare} ↔ ${currentBase}...`,
        cancellable: false,
      },
      async () => {
        const swapped = await gitService.getBranchComparison(
          comparison!.repoRoot,
          currentCompare,
          currentBase
        );
        treeDataProvider.setWorktreeComparison(currentBase, swapped);
        compareTreeDataProvider.setComparison(swapped);
        vscode.window.showInformationMessage(
          `TonyGitLens: Swapped comparison to ${currentCompare} ↔ ${currentBase}`
        );
      }
    );
  }

  // Command: Compare Worktree Branch (1-Selection GitLens flow)
  const compareWorktreeBranchCmd = vscode.commands.registerCommand(
    'tonygitlens.compareWorktreeBranch',
    async (item?: WorktreeItem | WorktreeCompareItem) => {
      let wtPath: string | undefined;
      let baseBranch: string | undefined;

      if (item instanceof WorktreeCompareItem) {
        wtPath = item.worktreePath;
        baseBranch = item.branchName;
      } else if (item instanceof WorktreeItem) {
        wtPath = item.worktreePath;
        baseBranch = item.worktree.branch || path.basename(item.worktreePath);
      } else if (item && typeof (item as any).worktreePath === 'string') {
        wtPath = (item as any).worktreePath;
        baseBranch = (item as any).branchName || (item as any).worktree?.branch;
      }

      const repoRoot = (wtPath ? await gitService.getRepoRoot(wtPath) : undefined) ||
        (await getActiveRepoRoot());

      if (!repoRoot) {
        vscode.window.showErrorMessage('No active Git repository found.');
        return;
      }

      const resolvedBase = baseBranch || 'main';
      const branches = await gitService.getBranches(repoRoot);
      const targetOptions = branches
        .filter((b) => b.name !== resolvedBase)
        .map((b) => ({
          label: b.name,
          description: b.isRemote ? '(remote)' : b.isCurrent ? '(current)' : '',
          iconPath: new vscode.ThemeIcon(b.isRemote ? 'cloud' : 'git-branch'),
        }));

      if (targetOptions.length === 0) {
        vscode.window.showInformationMessage(`No other branches found to compare with '${resolvedBase}'.`);
        return;
      }

      const selected = await vscode.window.showQuickPick(targetOptions, {
        placeHolder: `Select branch to compare with '${resolvedBase}'`,
      });

      if (!selected) {
        return;
      }

      const compareBranch = selected.label;
      outputChannel.appendLine(`Comparing branches: ${resolvedBase} ↔ ${compareBranch}`);

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Comparing ${resolvedBase} with ${compareBranch}...`,
          cancellable: false,
        },
        async () => {
          const comparison = await gitService.getBranchComparison(
            repoRoot,
            resolvedBase,
            compareBranch
          );
          compareTreeDataProvider.setComparison(comparison);
          treeDataProvider.setWorktreeComparison(resolvedBase, comparison);
          vscode.window.showInformationMessage(`TonyGitLens: Comparing ${resolvedBase} ↔ ${compareBranch}`);
        }
      );
    }
  );

  // Command: Compare Branches (defaults to current branch as base — 1-selection flow)
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

      // Automatically determine base branch from current checkout
      const baseBranch = branches.find((b) => b.isCurrent)?.name || branches[0].name;

      const targetOptions = branches
        .filter((b) => b.name !== baseBranch)
        .map((b) => ({
          label: b.name,
          description: b.isRemote ? '(remote)' : '',
          iconPath: new vscode.ThemeIcon(b.isRemote ? 'cloud' : 'git-branch'),
        }));

      if (targetOptions.length === 0) {
        vscode.window.showInformationMessage(`No other branches found to compare with '${baseBranch}'.`);
        return;
      }

      const comparePick = await vscode.window.showQuickPick(targetOptions, {
        placeHolder: `Select branch to compare with '${baseBranch}'`,
      });
      if (!comparePick) return;

      const compareBranch = comparePick.label;
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
          treeDataProvider.setWorktreeComparison(baseBranch, comparison);
          vscode.window.showInformationMessage(`TonyGitLens: Comparing ${baseBranch} ↔ ${compareBranch}`);
        }
      );
    }
  );

  // Command: Swap Base and Target in Comparison
  const swapComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.swapComparison',
    handleSwapBranchComparison
  );

  // Command: Swap Specific Branch Comparison
  const swapBranchComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.swapBranchComparison',
    handleSwapBranchComparison
  );

  // Command: Clear Branch Comparison (specific branch or picker)
  const clearBranchComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.clearBranchComparison',
    handleClearBranchComparison
  );

  // Command: Clear Comparison (polymorphic: branch-specific if item passed, otherwise all)
  const clearComparisonCmd = vscode.commands.registerCommand(
    'tonygitlens.clearComparison',
    async (item?: any) => {
      if (item && resolveBranchName(item)) {
        await handleClearBranchComparison(item);
        return;
      }
      compareTreeDataProvider.clearComparison();
      treeDataProvider.clearWorktreeComparison();
      vscode.window.showInformationMessage('TonyGitLens: Cleared all comparisons.');
      outputChannel.appendLine('Cleared all comparisons.');
    }
  );

  // Command: Clear All Comparisons
  const clearAllComparisonsCmd = vscode.commands.registerCommand(
    'tonygitlens.clearAllComparisons',
    () => {
      compareTreeDataProvider.clearComparison();
      treeDataProvider.clearWorktreeComparison();
      vscode.window.showInformationMessage('TonyGitLens: Cleared all comparisons.');
      outputChannel.appendLine('Cleared all comparisons.');
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
        treeDataProvider.setWorktreeComparison(current.baseBranch, refreshed);
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
    swapBranchComparisonCmd,
    clearComparisonCmd,
    clearBranchComparisonCmd,
    clearAllComparisonsCmd,
    refreshComparisonCmd,
    diffCompareFileCmd,
    workspaceFoldersWatcher
  );

  outputChannel.appendLine('TonyGitLens extension successfully initialized.');
}

export function deactivate() {}
