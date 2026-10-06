/**
 * Tests for git.ts wrapper
 *
 * Uses real git in temp directories. Tests are skip-safe if git is unavailable.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gitAvailable,
  isGitRepo,
  gitInitRepo,
  gitCommitAll,
  gitStatus,
} from "../src/git.ts";

// Skip all if no git
let gitOk = false;
try {
  gitOk = await gitAvailable();
} catch {
  gitOk = false;
}

if (!gitOk) {
  console.log("⊗ git.test.mjs skipped (git unavailable)");
  process.exit(0);
}

// Helper to create temp git repo
function createTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pi-memory-test-"));
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

// === isGitRepo ===
{
  const nonRepo = createTempRepo();
  assert.equal(await isGitRepo(nonRepo), false);
  cleanup(nonRepo);
}

{
  const repo = createTempRepo();
  await gitInitRepo(repo);
  assert.equal(await isGitRepo(repo), true);
  cleanup(repo);
}

// === gitInitRepo ===
{
  const repo = createTempRepo();
  const result = await gitInitRepo(repo);
  assert.ok(result.ok, `git init failed: ${result.stderr}`);
  assert.ok(await isGitRepo(repo));
  cleanup(repo);
}

// === gitCommitAll ===
{
  const repo = createTempRepo();
  await gitInitRepo(repo);
  
  // Commit empty repo -> no commit
  const empty = await gitCommitAll(repo, "empty commit");
  assert.ok(!empty.committed);
  assert.equal(empty.error, undefined);
  
  // Add a file and commit
  writeFileSync(join(repo, "test.md"), "# Test\n");
  const first = await gitCommitAll(repo, "initial");
  assert.ok(first.committed);
  assert.ok(first.commit);
  
  // Same content -> no commit
  const dup = await gitCommitAll(repo, "duplicate");
  assert.ok(!dup.committed);
  
  // Modify and commit
  writeFileSync(join(repo, "test.md"), "# Modified\n");
  const second = await gitCommitAll(repo, "update");
  assert.ok(second.committed);
  
  cleanup(repo);
}

// === gitStatus ===
{
  const repo = createTempRepo();
  await gitInitRepo(repo);
  
  // Empty repo status
  const status1 = await gitStatus(repo);
  assert.ok(!status1.dirty);
  assert.equal(status1.changes, 0);
  
  // Add uncommitted file
  writeFileSync(join(repo, "uncommitted.md"), "content\n");
  const status2 = await gitStatus(repo);
  assert.ok(status2.dirty);
  assert.equal(status2.changes, 1);
  
  // Commit it
  await gitCommitAll(repo, "add file");
  const status3 = await gitStatus(repo);
  assert.ok(!status3.dirty);
  assert.ok(status3.lastCommit);
  assert.match(status3.lastCommit.hash, /^[0-9a-f]+$/);
  assert.match(status3.lastCommit.date, /^\d{4}-\d{2}-\d{2}$/);
  
  cleanup(repo);
}

console.log("✓ git.test.mjs passed");
