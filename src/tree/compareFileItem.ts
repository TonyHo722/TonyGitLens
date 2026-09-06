import * as vscode from 'vscode';
import * as path from 'path';
import { ComparisonFileChange } from '../models/git';

export class CompareFileItem extends vscode.TreeItem {
  public readonly change: ComparisonFileChange;

  constructor(change: ComparisonFileChange) {
    const fileName = path.basename(change.path);
    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.change = change;

    const dirName = path.dirname(change.path);
    const dirDisplay = dirName === '.' ? '' : `${dirName}/`;
    this.description = `${dirDisplay} [${change.status}]`;

    // Tooltip
    this.tooltip = `${change.status}: ${change.path}${change.originalPath ? ` (from ${change.originalPath})` : ''}\nComparing: ${change.baseRef} ↔ ${change.compareRef}`;

    // Status Icon
    switch (change.status) {
      case 'A':
        this.iconPath = new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
        break;
      case 'M':
        this.iconPath = new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        break;
      case 'D':
        this.iconPath = new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
        break;
      case 'R':
        this.iconPath = new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('file');
        break;
    }

    // Command to open diff when clicked
    this.command = {
      command: 'tonygitlens.diffCompareFile',
      title: 'View Changes',
      arguments: [this],
    };

    this.contextValue = 'compareFile';
  }
}
