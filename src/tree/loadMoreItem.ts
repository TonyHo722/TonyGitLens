import * as vscode from 'vscode';

export class LoadMoreItem extends vscode.TreeItem {
  public readonly worktreePath: string;

  constructor(worktreePath: string, currentCount: number) {
    super('Load more commits...', vscode.TreeItemCollapsibleState.None);
    this.worktreePath = worktreePath;
    this.description = `(showing ${currentCount})`;
    this.tooltip = 'Click to fetch more commits for this worktree';
    this.iconPath = new vscode.ThemeIcon('ellipsis');
    this.contextValue = 'loadMore';

    this.command = {
      command: 'tonygitlens.loadMoreCommits',
      title: 'Load More Commits',
      arguments: [worktreePath],
    };
  }
}
