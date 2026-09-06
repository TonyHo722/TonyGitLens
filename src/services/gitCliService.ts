import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Worktree, Commit, CommitFileChange } from '../models/git';

export class GitCliService {
  private readonly gitBinary: string;

  constructor(gitBinary: string = 'git') {
    this.gitBinary = gitBinary;
  }

  /**
   * Executes a git command and returns its standard output.
   */
  public exec(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.gitBinary,
        args,
        {
          cwd,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          windowsHide: true,
          env: {
            ...process.env,
            LC_ALL: 'C', // Ensure consistent output formatting
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr?.trim() || error.message;
            reject(new Error(`Git execution failed (${args.join(' ')}): ${msg}`));
            return;
          }
          resolve(stdout);
        }
      );
    });
  }

  /**
   * Returns the top-level repository root directory for the given path.
   */
  public async getRepoRoot(cwd: string): Promise<string | undefined> {
    try {
      const output = await this.exec(['rev-parse', '--show-toplevel'], cwd);
      const trimmed = output.trim();
      return trimmed ? path.resolve(trimmed) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Retrieves and parses all worktrees for the repository.
   */
  public async getWorktrees(repoRoot: string, currentWorkspacePath?: string): Promise<Worktree[]> {
    const output = await this.exec(['worktree', 'list', '--porcelain'], repoRoot);
    return this.parseWorktrees(output, currentWorkspacePath);
  }

  /**
   * Parses `git worktree list --porcelain` output.
   */
  public parseWorktrees(porcelainOutput: string, currentWorkspacePath?: string): Worktree[] {
    const normalizedCurrent = currentWorkspacePath
      ? path.resolve(currentWorkspacePath).toLowerCase()
      : undefined;

    const worktrees: Worktree[] = [];
    const stanzas = porcelainOutput.trim().split(/\r?\n\r?\n/);

    let isFirst = true;
    for (const stanza of stanzas) {
      if (!stanza.trim()) {
        continue;
      }

      const lines = stanza.split(/\r?\n/);
      let worktreePath = '';
      let head = '';
      let branch: string | undefined;
      let isBare = false;
      let isDetached = false;
      let isLocked = false;
      let lockReason: string | undefined;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktreePath = line.substring(9).trim();
        } else if (line.startsWith('HEAD ')) {
          head = line.substring(5).trim();
        } else if (line.startsWith('branch ')) {
          const rawBranch = line.substring(7).trim();
          branch = rawBranch.replace(/^refs\/heads\//, '');
        } else if (line === 'bare') {
          isBare = true;
        } else if (line === 'detached') {
          isDetached = true;
        } else if (line.startsWith('locked')) {
          isLocked = true;
          const reason = line.substring(6).trim();
          lockReason = reason || undefined;
        }
      }

      if (worktreePath && !isBare) {
        const resolvedPath = path.resolve(worktreePath);
        const isCurrent = normalizedCurrent
          ? resolvedPath.toLowerCase() === normalizedCurrent
          : false;

        worktrees.push({
          path: resolvedPath,
          head,
          branch: isDetached ? `DETACHED (${head.substring(0, 7)})` : branch,
          isMain: isFirst,
          isCurrent,
          isLocked,
          lockReason,
          isDetached,
        });

        isFirst = false;
      }
    }

    return worktrees;
  }

  /**
   * Retrieves commits for a worktree using NUL-delimited formatting.
   */
  public async getCommits(
    worktreePath: string,
    limit: number = 20,
    skip: number = 0
  ): Promise<Commit[]> {
    if (!fs.existsSync(worktreePath)) {
      return [];
    }

    // %H: full hash, %h: short hash, %an: author name, %ae: author email, %at: author unix timestamp, %s: subject, %P: parent hashes
    const format = '%H%x00%h%x00%an%x00%ae%x00%at%x00%s%x00%P';
    const args = ['log', `-n${limit}`, `--skip=${skip}`, `--format=${format}`];

    try {
      const output = await this.exec(args, worktreePath);
      return this.parseCommits(output, worktreePath);
    } catch {
      return [];
    }
  }

  /**
   * Parses git log output formatted with %x00 delimiters.
   */
  public parseCommits(logOutput: string, worktreePath: string): Commit[] {
    const commits: Commit[] = [];
    const lines = logOutput.trim().split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const parts = line.split('\0');
      if (parts.length >= 6) {
        const hash = parts[0];
        const shortHash = parts[1];
        const authorName = parts[2];
        const authorEmail = parts[3];
        const timestamp = parseInt(parts[4], 10);
        const subject = parts[5];
        const parents = parts[6] ? parts[6].trim().split(' ') : [];

        commits.push({
          hash,
          shortHash,
          authorName,
          authorEmail,
          date: new Date(timestamp * 1000),
          subject,
          parents,
          worktreePath,
        });
      }
    }

    return commits;
  }

  /**
   * Retrieves changed files for a specific commit.
   */
  public async getCommitFiles(
    worktreePath: string,
    commitHash: string
  ): Promise<CommitFileChange[]> {
    // Check if initial commit (no parents)
    const args = ['show', '--name-status', '--format=', commitHash];

    try {
      const output = await this.exec(args, worktreePath);
      return this.parseCommitFiles(output, commitHash, worktreePath);
    } catch {
      return [];
    }
  }

  /**
   * Parses git show --name-status output.
   */
  public parseCommitFiles(
    output: string,
    commitHash: string,
    worktreePath: string
  ): CommitFileChange[] {
    const files: CommitFileChange[] = [];
    const lines = output.trim().split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const parts = line.split(/\t+/);
      if (parts.length >= 2) {
        const rawStatus = parts[0].trim();
        const statusCode = (rawStatus[0] || 'M') as CommitFileChange['status'];

        if (rawStatus.startsWith('R') || rawStatus.startsWith('C')) {
          // Rename or Copy: format is Status <oldPath> <newPath>
          const originalPath = parts[1].trim();
          const targetPath = parts[2] ? parts[2].trim() : originalPath;
          files.push({
            status: statusCode,
            path: targetPath,
            originalPath,
            commitHash,
            worktreePath,
          });
        } else {
          const filePath = parts[1].trim();
          files.push({
            status: statusCode,
            path: filePath,
            commitHash,
            worktreePath,
          });
        }
      }
    }

    return files;
  }

  /**
   * Retrieves file contents at a specific commit revision.
   */
  public async getFileContentAtCommit(
    worktreePath: string,
    commitHash: string,
    relativePath: string
  ): Promise<string> {
    try {
      // Normalize slashes to forward slashes for git rev-parse paths
      const normalizedPath = relativePath.replace(/\\/g, '/');
      return await this.exec(['show', `${commitHash}:${normalizedPath}`], worktreePath);
    } catch (err: any) {
      // If file didn't exist at this commit (e.g. added in commit, parent doesn't have it)
      return '';
    }
  }
}
