import * as assert from 'assert';
import * as path from 'path';
import { GitCliService } from '../src/services/gitCliService';

async function runTests() {
  console.log('--- Running GitCliService Tests ---');
  const service = new GitCliService();
  const repoRoot = path.resolve(__dirname, '..');

  // Test 1: getRepoRoot
  console.log('Test 1: getRepoRoot');
  const detectedRoot = await service.getRepoRoot(repoRoot);
  assert.strictEqual(detectedRoot, repoRoot, 'Repo root should match workspace directory');
  console.log('✓ getRepoRoot passed');

  // Test 2: getWorktrees
  console.log('Test 2: getWorktrees');
  const worktrees = await service.getWorktrees(repoRoot, repoRoot);
  assert.ok(worktrees.length >= 1, 'Should find at least 1 worktree');
  const mainWt = worktrees[0];
  assert.strictEqual(mainWt.isMain, true, 'First worktree should be main');
  assert.strictEqual(mainWt.isCurrent, true, 'Current worktree should be flagged isCurrent');
  assert.strictEqual(mainWt.branch, 'main', 'Branch should be main');
  assert.ok(mainWt.head.length === 40, 'HEAD should be a 40-char SHA');
  console.log(`✓ getWorktrees passed (${worktrees.length} worktree found: ${mainWt.branch} at ${mainWt.path})`);

  // Test 3: getCommits
  console.log('Test 3: getCommits');
  const commits = await service.getCommits(mainWt.path, 10);
  assert.ok(commits.length >= 1, 'Should find at least 1 commit');
  const firstCommit = commits[0];
  assert.ok(firstCommit.hash.length === 40, 'Commit hash should be 40 chars');
  assert.ok(firstCommit.shortHash.length >= 7, 'Short hash should be >= 7 chars');
  assert.ok(firstCommit.subject.length > 0, 'Commit subject should not be empty');
  assert.strictEqual(firstCommit.authorName, 'Tony Ho', 'Author name should be Tony Ho');
  console.log(`✓ getCommits passed (Latest: [${firstCommit.shortHash}] ${firstCommit.subject})`);

  // Test 4: getCommitFiles
  console.log('Test 4: getCommitFiles');
  const files = await service.getCommitFiles(mainWt.path, firstCommit.hash);
  assert.ok(files.length >= 1, 'Should find files in the latest commit');
  const filePaths = files.map(f => f.path);
  assert.ok(filePaths.length > 0, 'Commit should have changed files');
  assert.ok(files.every(f => f.status && f.path && f.commitHash === firstCommit.hash), 'File change objects must be well-formed');
  console.log(`✓ getCommitFiles passed (${files.length} files changed in ${firstCommit.shortHash}: ${filePaths.slice(0, 3).join(', ')}...)`);

  // Test 5: getFileContentAtCommit
  console.log('Test 5: getFileContentAtCommit');
  const sampleFile = filePaths[0];
  const fileContent = await service.getFileContentAtCommit(mainWt.path, firstCommit.hash, sampleFile);
  assert.ok(fileContent.length > 0, `Content of ${sampleFile} should not be empty`);
  console.log(`✓ getFileContentAtCommit passed (retrieved ${fileContent.length} bytes for ${sampleFile})`);

  // Test 6: parseWorktrees unit test with detached and locked stanzas
  console.log('Test 6: parseWorktrees edge cases');
  const samplePorcelain = `worktree /tmp/main
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /tmp/feature-locked
HEAD 2222222222222222222222222222222222222222
branch refs/heads/feature-locked
locked WIP on bugfix

worktree /tmp/detached-wt
HEAD 3333333333333333333333333333333333333333
detached
`;
  const parsed = service.parseWorktrees(samplePorcelain, '/tmp/feature-locked');
  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].isMain, true);
  assert.strictEqual(parsed[0].isCurrent, false);
  assert.strictEqual(parsed[1].isCurrent, true);
  assert.strictEqual(parsed[1].isLocked, true);
  assert.strictEqual(parsed[1].lockReason, 'WIP on bugfix');
  assert.strictEqual(parsed[2].isDetached, true);
  assert.strictEqual(parsed[2].branch, 'DETACHED (3333333)');
  console.log('✓ parseWorktrees edge cases passed');

  // Test 7: Multi-worktree creation & inspection
  console.log('Test 7: Dynamic worktree query');
  const allWorktrees = await service.getWorktrees(repoRoot, repoRoot);
  assert.ok(allWorktrees.length >= 1);
  console.log(`✓ dynamic worktree query verified (${allWorktrees[0].branch})`);

  // Test 8: getBranches
  console.log('Test 8: getBranches');
  const branches = await service.getBranches(repoRoot);
  assert.ok(branches.length >= 1, 'Should find at least 1 branch');
  const currentBranch = branches.find(b => b.isCurrent);
  assert.ok(currentBranch, 'Should detect current branch');
  assert.strictEqual(currentBranch.name, 'main', 'Current branch should be main');
  console.log(`✓ getBranches passed (Found ${branches.length} branch(es), current is ${currentBranch.name})`);

  // Test 9: parseComparisonFiles
  console.log('Test 9: parseComparisonFiles');
  const sampleDiff = `M\tsrc/extension.ts\nA\tsrc/newModule.ts\nD\toldFile.ts\nR100\tsrc/old.ts\tsrc/renamed.ts`;
  const parsedDiff = service.parseComparisonFiles(sampleDiff, 'main', 'feature', repoRoot);
  assert.strictEqual(parsedDiff.length, 4);
  assert.strictEqual(parsedDiff[0].status, 'M');
  assert.strictEqual(parsedDiff[0].path, 'src/extension.ts');
  assert.strictEqual(parsedDiff[1].status, 'A');
  assert.strictEqual(parsedDiff[2].status, 'D');
  assert.strictEqual(parsedDiff[3].status, 'R');
  assert.strictEqual(parsedDiff[3].path, 'src/renamed.ts');
  assert.strictEqual(parsedDiff[3].originalPath, 'src/old.ts');
  console.log('✓ parseComparisonFiles passed');

  // Test 10: getBranchComparison self-comparison
  console.log('Test 10: getBranchComparison');
  const comparison = await service.getBranchComparison(repoRoot, 'main', 'main');
  assert.strictEqual(comparison.baseBranch, 'main');
  assert.strictEqual(comparison.compareBranch, 'main');
  assert.strictEqual(comparison.aheadCommits.length, 0);
  assert.strictEqual(comparison.behindCommits.length, 0);
  assert.strictEqual(comparison.fileChanges.length, 0);
  console.log('✓ getBranchComparison passed (self-comparison returns 0 changes as expected)');

  console.log('\n🎉 ALL 10 TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
