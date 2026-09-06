export interface Worktree {
  path: string;
  head: string;
  branch?: string;
  isMain: boolean;
  isCurrent: boolean;
  isLocked: boolean;
  lockReason?: string;
  isDetached: boolean;
}

export interface Commit {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: Date;
  subject: string;
  parents: string[];
  worktreePath: string;
}

export interface CommitFileChange {
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | '?';
  path: string;
  originalPath?: string;
  commitHash: string;
  worktreePath: string;
}

export interface GitRepo {
  rootUri: string;
  commonDir?: string;
}

export interface BranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
}

export interface ComparisonFileChange {
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | '?';
  path: string;
  originalPath?: string;
  baseRef: string;
  compareRef: string;
  repoRoot: string;
}

export interface BranchComparison {
  repoRoot: string;
  baseBranch: string;
  compareBranch: string;
  aheadCommits: Commit[];
  behindCommits: Commit[];
  fileChanges: ComparisonFileChange[];
}

