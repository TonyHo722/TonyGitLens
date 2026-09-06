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
  assert.ok(files.length >= 2, 'Should find at least 2 files in initial commit');
  const filePaths = files.map(f => f.path);
  assert.ok(filePaths.includes('.gitignore'), 'Files should include .gitignore');
  assert.ok(filePaths.includes('doc/spec.html'), 'Files should include doc/spec.html');
  console.log(`✓ getCommitFiles passed (Files: ${filePaths.join(', ')})`);

  // Test 5: getFileContentAtCommit
  console.log('Test 5: getFileContentAtCommit');
  const gitignoreContent = await service.getFileContentAtCommit(mainWt.path, firstCommit.hash, '.gitignore');
  assert.ok(gitignoreContent.includes('node_modules/'), 'Content should contain node_modules/');
  console.log('✓ getFileContentAtCommit passed');

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

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
