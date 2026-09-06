import * as vscode from 'vscode';
import * as path from 'path';
import { GitCliService } from '../services/gitCliService';
import { BranchComparison } from '../models/git';
import { WorktreeItem } from '../tree/worktreeItem';
import { WorktreeCompareItem } from '../tree/worktreeCompareItem';
import { CompareSectionItem } from '../tree/compareSectionItem';
import { CompareFileItem } from '../tree/compareFileItem';
import { CommitItem } from '../tree/commitItem';
import { CommitFileItem } from '../tree/commitFileItem';
import { LoadMoreItem } from '../tree/loadMoreItem';

export class WorktreeTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly gitService: GitCliService;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly commitLimits = new Map<string, number>();
  private readonly activeComparisons = new Map<string, BranchComparison>();
  private readonly DEFAULT_LIMIT = 15;
  private readonly PAGE_STEP = 15;

  constructor(gitService: GitCliService) {
    this.gitService = gitService;
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public loadMore(worktreePath: string): void {
    const current = this.commitLimits.get(worktreePath) || this.DEFAULT_LIMIT;
    this.commitLimits.set(worktreePath, current + this.PAGE_STEP);
    this._onDidChangeTreeData.fire();
  }

  public setWorktreeComparison(branchName: string, comparison: BranchComparison): void {
    this.activeComparisons.set(branchName, comparison);
    this._onDidChangeTreeData.fire();
  }

  public clearWorktreeComparison(branchName?: string): void {
    if (branchName) {
      this.activeComparisons.delete(branchName);
    } else {
      this.activeComparisons.clear();
    }
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      return this.getRootWorktrees();
    }

    if (element instanceof WorktreeItem) {
      return this.getWorktreeCommits(element);
    }

    if (element instanceof WorktreeCompareItem) {
      return this.getWorktreeComparisonChildren(element);
    }

    if (element instanceof CompareSectionItem) {
      return this.getCompareSectionChildren(element);
    }

    if (element instanceof CommitItem) {
      return this.getCommitFiles(element);
    }

    return [];
  }

  private async getRootWorktrees(): Promise<vscode.TreeItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      const item = new vscode.TreeItem('No folder opened in workspace');
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }

    const currentFolder = workspaceFolders[0].uri.fsPath;
    const repoRoot = await this.gitService.getRepoRoot(currentFolder);

    if (!repoRoot) {
      const item = new vscode.TreeItem('Not a Git repository');
      item.iconPath = new vscode.ThemeIcon('warning');
      return [item];
    }

    try {
      const worktrees = await this.gitService.getWorktrees(repoRoot, currentFolder);
      if (worktrees.length === 0) {
        const item = new vscode.TreeItem('No worktrees detected');
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }

      return worktrees.map((wt) => new WorktreeItem(wt));
    } catch (err: any) {
      const item = new vscode.TreeItem(`Error loading worktrees: ${err.message}`);
      item.iconPath = new vscode.ThemeIcon('error');
      return [item];
    }
  }

  private async getWorktreeCommits(element: WorktreeItem): Promise<vscode.TreeItem[]> {
    const worktreePath = element.worktreePath;
    const limit = this.commitLimits.get(worktreePath) || this.DEFAULT_LIMIT;
    const branchName = element.worktree.branch || path.basename(worktreePath);

    try {
      const commits = await this.gitService.getCommits(worktreePath, limit + 1, 0);
      const hasMore = commits.length > limit;
      const visibleCommits = hasMore ? commits.slice(0, limit) : commits;

      const items: vscode.TreeItem[] = [];

      // 1. Contextual Compare Item directly below worktree branch
      const activeComparison = this.activeComparisons.get(branchName);
      items.push(new WorktreeCompareItem(element, activeComparison));

      // 2. Commits
      if (visibleCommits.length === 0) {
        const emptyItem = new vscode.TreeItem('No commits found in this worktree');
        emptyItem.iconPath = new vscode.ThemeIcon('info');
        items.push(emptyItem);
      } else {
        items.push(...visibleCommits.map((commit) => new CommitItem(commit, worktreePath)));
      }

      // 3. Load More item
      if (hasMore) {
        items.push(new LoadMoreItem(worktreePath, visibleCommits.length));
      }

      return items;
    } catch (err: any) {
      const errorItem = new vscode.TreeItem(`Error loading commits: ${err.message}`);
      errorItem.iconPath = new vscode.ThemeIcon('error');
      return [errorItem];
    }
  }

  private getWorktreeComparisonChildren(element: WorktreeCompareItem): vscode.TreeItem[] {
    if (!element.comparison) {
      return [];
    }

    return [
      new CompareSectionItem('files', element.comparison),
      new CompareSectionItem('ahead', element.comparison),
      new CompareSectionItem('behind', element.comparison),
    ];
  }

  private getCompareSectionChildren(element: CompareSectionItem): vscode.TreeItem[] {
    const comparison = element.comparison;

    switch (element.sectionType) {
      case 'files':
        if (comparison.fileChanges.length === 0) {
          const noChanges = new vscode.TreeItem('Branches are identical (no file differences)');
          noChanges.iconPath = new vscode.ThemeIcon('check');
          return [noChanges];
        }
        return comparison.fileChanges.map((change) => new CompareFileItem(change));

      case 'ahead':
        if (comparison.aheadCommits.length === 0) {
          const noAhead = new vscode.TreeItem('No commits ahead');
          noAhead.iconPath = new vscode.ThemeIcon('info');
          return [noAhead];
        }
        return comparison.aheadCommits.map(
          (c) => new CommitItem(c, comparison.repoRoot)
        );

      case 'behind':
        if (comparison.behindCommits.length === 0) {
          const noBehind = new vscode.TreeItem('No commits behind');
          noBehind.iconPath = new vscode.ThemeIcon('info');
          return [noBehind];
        }
        return comparison.behindCommits.map(
          (c) => new CommitItem(c, comparison.repoRoot)
        );
    }
  }

  private async getCommitFiles(element: CommitItem): Promise<vscode.TreeItem[]> {
    try {
      const files = await this.gitService.getCommitFiles(element.worktreePath, element.commitHash);

      if (files.length === 0) {
        const item = new vscode.TreeItem('No changed files in this commit');
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }

      const parentHash = element.commit.parents[0];
      return files.map((file) => new CommitFileItem(file, parentHash));
    } catch (err: any) {
      const errorItem = new vscode.TreeItem(`Error loading files: ${err.message}`);
      errorItem.iconPath = new vscode.ThemeIcon('error');
      return [errorItem];
    }
  }
}
