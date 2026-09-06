import * as vscode from 'vscode';
import { WorktreeItem } from './worktreeItem';
import { BranchComparison } from '../models/git';

export class WorktreeCompareItem extends vscode.TreeItem {
  public readonly worktreeItem: WorktreeItem;
  public readonly comparison?: BranchComparison;

  constructor(worktreeItem: WorktreeItem, comparison?: BranchComparison) {
    const branchName = worktreeItem.worktree.branch || 'current';

    if (!comparison) {
      // Uncompared state: interactive prompt item
      super(`Compare '${branchName}' with...`, vscode.TreeItemCollapsibleState.None);
      this.description = '(click to select target)';
      this.tooltip = `Click to choose a branch to compare with '${branchName}'`;
      this.iconPath = new vscode.ThemeIcon('git-compare', new vscode.ThemeColor('charts.blue'));
      this.command = {
        command: 'tonygitlens.compareWorktreeBranch',
        title: 'Compare with...',
        arguments: [worktreeItem],
      };
      this.contextValue = 'worktreeComparePrompt';
    } else {
      // Compared state: expandable comparison tree
      const ahead = comparison.aheadCommits.length;
      const behind = comparison.behindCommits.length;
      const files = comparison.fileChanges.length;

      super(
        `Compared with '${comparison.compareBranch}'`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      this.description = `[${ahead} ahead, ${behind} behind • ${files} files]`;

      const md = new vscode.MarkdownString();
      md.appendMarkdown(`### Comparison: **${branchName}** ↔ **${comparison.compareBranch}**\n\n`);
      md.appendMarkdown(`- **Commits Ahead:** ${ahead}\n`);
      md.appendMarkdown(`- **Commits Behind:** ${behind}\n`);
      md.appendMarkdown(`- **Files Changed:** ${files}\n`);
      this.tooltip = md;

      this.iconPath = new vscode.ThemeIcon('git-compare', new vscode.ThemeColor('charts.green'));
      this.contextValue = 'worktreeCompareActive';
    }

    this.worktreeItem = worktreeItem;
    this.comparison = comparison;
  }
}
