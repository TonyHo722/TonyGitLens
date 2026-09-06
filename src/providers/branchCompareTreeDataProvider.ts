import * as vscode from 'vscode';
import { GitCliService } from '../services/gitCliService';
import { BranchComparison } from '../models/git';
import { CompareRootItem } from '../tree/compareRootItem';
import { CompareSectionItem } from '../tree/compareSectionItem';
import { CompareFileItem } from '../tree/compareFileItem';
import { CommitItem } from '../tree/commitItem';
import { CommitFileItem } from '../tree/commitFileItem';

export class BranchCompareTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly gitService: GitCliService;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private activeComparison?: BranchComparison;

  constructor(gitService: GitCliService) {
    this.gitService = gitService;
  }

  public setComparison(comparison: BranchComparison): void {
    this.activeComparison = comparison;
    this._onDidChangeTreeData.fire();
  }

  public getComparison(): BranchComparison | undefined {
    return this.activeComparison;
  }

  public clearComparison(): void {
    this.activeComparison = undefined;
    this._onDidChangeTreeData.fire();
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!this.activeComparison) {
      const item = new vscode.TreeItem('No active branch comparison');
      item.description = 'Click $(git-compare) on a worktree to compare';
      item.iconPath = new vscode.ThemeIcon('git-compare');
      item.command = {
        command: 'tonygitlens.compareBranches',
        title: 'Compare Branches...',
      };
      return [item];
    }

    if (!element) {
      return [new CompareRootItem(this.activeComparison)];
    }

    if (element instanceof CompareRootItem) {
      return [
        new CompareSectionItem('files', this.activeComparison),
        new CompareSectionItem('ahead', this.activeComparison),
        new CompareSectionItem('behind', this.activeComparison),
      ];
    }

    if (element instanceof CompareSectionItem) {
      switch (element.sectionType) {
        case 'files':
          if (this.activeComparison.fileChanges.length === 0) {
            const noChanges = new vscode.TreeItem('Branches are identical (no file differences)');
            noChanges.iconPath = new vscode.ThemeIcon('check');
            return [noChanges];
          }
          return this.activeComparison.fileChanges.map((change) => new CompareFileItem(change));

        case 'ahead':
          if (this.activeComparison.aheadCommits.length === 0) {
            const noAhead = new vscode.TreeItem('No commits ahead');
            noAhead.iconPath = new vscode.ThemeIcon('info');
            return [noAhead];
          }
          return this.activeComparison.aheadCommits.map(
            (c) => new CommitItem(c, this.activeComparison!.repoRoot)
          );

        case 'behind':
          if (this.activeComparison.behindCommits.length === 0) {
            const noBehind = new vscode.TreeItem('No commits behind');
            noBehind.iconPath = new vscode.ThemeIcon('info');
            return [noBehind];
          }
          return this.activeComparison.behindCommits.map(
            (c) => new CommitItem(c, this.activeComparison!.repoRoot)
          );
      }
    }

    if (element instanceof CommitItem) {
      try {
        const files = await this.gitService.getCommitFiles(
          element.worktreePath,
          element.commitHash
        );
        const parentHash = element.commit.parents[0];
        return files.map((file) => new CommitFileItem(file, parentHash));
      } catch (err: any) {
        const errItem = new vscode.TreeItem(`Error loading files: ${err.message}`);
        errItem.iconPath = new vscode.ThemeIcon('error');
        return [errItem];
      }
    }

    return [];
  }
}
