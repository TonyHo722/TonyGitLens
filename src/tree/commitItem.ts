import * as vscode from 'vscode';
import { Commit } from '../models/git';
import { formatRelativeTime } from '../utils/date';

export class CommitItem extends vscode.TreeItem {
  public readonly commit: Commit;
  public readonly worktreePath: string;

  constructor(commit: Commit, worktreePath: string) {
    super(commit.subject, vscode.TreeItemCollapsibleState.Collapsed);
    this.commit = commit;
    this.worktreePath = worktreePath;

    // e.g. "7a1f2b3 • 2h ago • Tony Ho"
    this.description = `${commit.shortHash} • ${formatRelativeTime(commit.date)} • ${commit.authorName}`;

    // Rich Markdown tooltip
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### Commit **${commit.shortHash}**\n\n`);
    md.appendMarkdown(`**${commit.subject}**\n\n`);
    md.appendMarkdown(`- **Full SHA:** \`${commit.hash}\`\n`);
    md.appendMarkdown(`- **Author:** ${commit.authorName} &lt;${commit.authorEmail}&gt;\n`);
    md.appendMarkdown(`- **Date:** ${commit.date.toLocaleString()}\n`);
    if (commit.parents.length > 0) {
      md.appendMarkdown(`- **Parents:** ${commit.parents.map(p => `\`${p.substring(0, 7)}\``).join(', ')}\n`);
    }
    this.tooltip = md;

    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.contextValue = 'commit';
  }

  public get commitHash(): string {
    return this.commit.hash;
  }
}
