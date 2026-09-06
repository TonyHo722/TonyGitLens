import * as vscode from 'vscode';
import { BranchComparison } from '../models/git';

export class CompareRootItem extends vscode.TreeItem {
  public readonly comparison: BranchComparison;

  constructor(comparison: BranchComparison) {
    super(
      `${comparison.baseBranch} ↔ ${comparison.compareBranch}`,
      vscode.TreeItemCollapsibleState.Expanded
    );

    this.comparison = comparison;
    const ahead = comparison.aheadCommits.length;
    const behind = comparison.behindCommits.length;
    const files = comparison.fileChanges.length;

    this.description = `[${ahead} ahead, ${behind} behind • ${files} files]`;

    // Tooltip
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### Branch Comparison\n\n`);
    md.appendMarkdown(`- **Base:** \`${comparison.baseBranch}\`\n`);
    md.appendMarkdown(`- **Compare:** \`${comparison.compareBranch}\`\n`);
    md.appendMarkdown(`- **Commits Ahead:** ${ahead}\n`);
    md.appendMarkdown(`- **Commits Behind:** ${behind}\n`);
    md.appendMarkdown(`- **Files Changed:** ${files}\n`);
    this.tooltip = md;

    this.iconPath = new vscode.ThemeIcon('git-compare', new vscode.ThemeColor('charts.blue'));
    this.contextValue = 'compareRoot';
  }
}
