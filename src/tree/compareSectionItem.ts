import * as vscode from 'vscode';
import { BranchComparison } from '../models/git';

export type CompareSectionType = 'files' | 'ahead' | 'behind';

export class CompareSectionItem extends vscode.TreeItem {
  public readonly sectionType: CompareSectionType;
  public readonly comparison: BranchComparison;

  constructor(sectionType: CompareSectionType, comparison: BranchComparison) {
    let label = '';
    let iconName = '';
    let count = 0;

    switch (sectionType) {
      case 'files':
        count = comparison.fileChanges.length;
        label = `Files Changed (${count})`;
        iconName = 'diff';
        break;
      case 'ahead':
        count = comparison.aheadCommits.length;
        label = `Commits Ahead (${count})`;
        iconName = 'arrow-up';
        break;
      case 'behind':
        count = comparison.behindCommits.length;
        label = `Commits Behind (${count})`;
        iconName = 'arrow-down';
        break;
    }

    const state = count > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;

    super(label, state);

    this.sectionType = sectionType;
    this.comparison = comparison;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = `compareSection-${sectionType}`;
  }
}
