import * as vscode from 'vscode';
import { GitCliService } from './services/gitCliService';

export function activate(context: vscode.ExtensionContext) {
  const gitService = new GitCliService();
  const outputChannel = vscode.window.createOutputChannel('TonyGitLens');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('TonyGitLens extension activated.');

  // Command: Refresh
  const refreshCmd = vscode.commands.registerCommand('tonygitlens.refresh', async () => {
    outputChannel.appendLine('Refreshing worktrees...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const repoRoot = await gitService.getRepoRoot(workspaceFolders[0].uri.fsPath);
      if (repoRoot) {
        const worktrees = await gitService.getWorktrees(repoRoot, workspaceFolders[0].uri.fsPath);
        outputChannel.appendLine(`Found ${worktrees.length} worktree(s).`);
      }
    }
    vscode.window.showInformationMessage('TonyGitLens: Refreshed worktrees');
  });

  // Command: Copy Commit SHA
  const copyShaCmd = vscode.commands.registerCommand(
    'tonygitlens.copyCommitSha',
    async (item?: { commitHash?: string }) => {
      if (item?.commitHash) {
        await vscode.env.clipboard.writeText(item.commitHash);
        vscode.window.showInformationMessage(`Copied SHA: ${item.commitHash.substring(0, 7)}`);
      }
    }
  );

  // Command: Open Worktree
  const openWorktreeCmd = vscode.commands.registerCommand(
    'tonygitlens.openWorktree',
    async (item?: { worktreePath?: string }) => {
      if (item?.worktreePath) {
        const uri = vscode.Uri.file(item.worktreePath);
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
      }
    }
  );

  // Command: Reveal in File Explorer
  const revealCmd = vscode.commands.registerCommand(
    'tonygitlens.revealInFileExplorer',
    async (item?: { worktreePath?: string }) => {
      if (item?.worktreePath) {
        const uri = vscode.Uri.file(item.worktreePath);
        await vscode.commands.executeCommand('revealFileInOS', uri);
      }
    }
  );

  context.subscriptions.push(refreshCmd, copyShaCmd, openWorktreeCmd, revealCmd);
}

export function deactivate() {}
