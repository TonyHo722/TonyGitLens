import * as vscode from 'vscode';
import { GitCliService } from '../services/gitCliService';

export class CommitContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly SCHEME = 'tonygitlens';

  private readonly gitService: GitCliService;
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(gitService: GitCliService) {
    this.gitService = gitService;
  }

  /**
   * Generates a virtual URI for a file at a specific commit.
   */
  public static toUri(worktreePath: string, commitHash: string, relativePath: string): vscode.Uri {
    const cleanPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
    const query = new URLSearchParams({
      worktree: worktreePath,
      ref: commitHash,
    }).toString();

    return vscode.Uri.from({
      scheme: CommitContentProvider.SCHEME,
      authority: 'commit',
      path: `/${cleanPath}`,
      query,
    });
  }

  /**
   * Generates a virtual URI representing an empty document (used for added/deleted diffs).
   */
  public static toEmptyUri(relativePath: string): vscode.Uri {
    const cleanPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
    const query = new URLSearchParams({
      ref: 'empty',
    }).toString();

    return vscode.Uri.from({
      scheme: CommitContentProvider.SCHEME,
      authority: 'commit',
      path: `/${cleanPath}`,
      query,
    });
  }

  public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const ref = params.get('ref');
    const worktree = params.get('worktree');
    const relativePath = uri.path.replace(/^\//, '');

    if (!ref || ref === 'empty' || !worktree) {
      return '';
    }

    return await this.gitService.getFileContentAtCommit(worktree, ref, relativePath);
  }
}
