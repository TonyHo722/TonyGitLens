import * as vscode from 'vscode';
import * as path from 'path';
import { Worktree } from '../models/git';

export class WorktreeItem extends vscode.TreeItem {
  public readonly worktree: Worktree;

  constructor(worktree: Worktree) {
    const label = worktree.branch || path.basename(worktree.path);
    const collapsibleState = worktree.isCurrent
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;

    super(label, collapsibleState);
    this.worktree = worktree;

    // Build description
    const descParts: string[] = [];
    if (worktree.isCurrent) {
      descParts.push('(current)');
    }
    if (worktree.isMain) {
      descParts.push('(main)');
    }
    if (worktree.isLocked) {
      descParts.push(`[Locked: ${worktree.lockReason || 'locked'}]`);
    }
    descParts.push(worktree.path);
    this.description = descParts.join(' ');

    // Build rich Markdown tooltip
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### Worktree: **${label}**\n\n`);
    md.appendMarkdown(`- **Path:** \`${worktree.path}\`\n`);
    md.appendMarkdown(`- **HEAD Commit:** \`${worktree.head.substring(0, 8)}\`\n`);
    md.appendMarkdown(`- **Role:** ${worktree.isMain ? 'Primary Worktree' : 'Linked Worktree'}\n`);
    if (worktree.isCurrent) {
      md.appendMarkdown(`- **Status:** Active in Current Workspace\n`);
    }
    if (worktree.isLocked) {
      md.appendMarkdown(`- **Locked:** ⚠️ ${worktree.lockReason || 'Yes'}\n`);
    }
    this.tooltip = md;

    // Set appropriate icon
    if (worktree.isLocked) {
      this.iconPath = new vscode.ThemeIcon('lock', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    } else if (worktree.isDetached) {
      this.iconPath = new vscode.ThemeIcon('git-commit');
    } else {
      this.iconPath = worktree.isCurrent
        ? new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('charts.green'))
        : new vscode.ThemeIcon('git-branch');
    }

    this.contextValue = 'worktree';
  }

  public get worktreePath(): string {
    return this.worktree.path;
  }
}
