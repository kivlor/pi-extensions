/**
 * Minimal git wrapper for the memory repo. Memory is a plain local git
 * repository: every save commits, so memory keeps a history. Commits degrade
 * gracefully (entries are still written) when git is unavailable or misconfigured.
 */

import { execFile } from "node:child_process";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const GIT_IDENTITY = { name: "pi-memory", email: "pi-memory@localhost" };

function git(root: string | undefined, args: string[], signal?: AbortSignal): Promise<GitResult> {
  return new Promise((resolve) => {
    const argv = root ? ["-C", root, ...args] : args;
    execFile("git", argv, { maxBuffer: 8 * 1024 * 1024, windowsHide: true, signal }, (error, stdout, stderr) => {
      // error.code is numeric for non-zero exits; anything else (ENOENT, signal kills) is fatal
      if (error && typeof error.code !== "number") {
        resolve({ ok: false, stdout: "", stderr: `git unavailable: ${error.message}` });
        return;
      }
      resolve({ ok: error == null, stdout: stdout.toString().trim(), stderr: stderr.toString().trim() });
    });
  });
}

export async function gitAvailable(): Promise<boolean> {
  const result = await git(undefined, ["--version"]);
  return result.ok;
}

export async function isGitRepo(root: string, signal?: AbortSignal): Promise<boolean> {
  const result = await git(root, ["rev-parse", "--is-inside-work-tree"], signal);
  return result.ok && result.stdout === "true";
}

/** `git init` plus a repo-local identity so commits work without global git config. */
export async function gitInitRepo(root: string, signal?: AbortSignal): Promise<GitResult> {
  const init = await git(root, ["init"], signal);
  if (!init.ok) return init;
  await git(root, ["config", "user.name", GIT_IDENTITY.name], signal);
  await git(root, ["config", "user.email", GIT_IDENTITY.email], signal);
  return init;
}

function identityError(stderr: string): boolean {
  return /tell me who you are|user\.name|author identity/i.test(stderr);
}

export interface CommitResult {
  committed: boolean;
  commit?: string;
  error?: string;
}

/** Stage everything and commit when there are changes; returns the short hash. */
export async function gitCommitAll(root: string, message: string, signal?: AbortSignal): Promise<CommitResult> {
  const add = await git(root, ["add", "-A"], signal);
  if (!add.ok) return { committed: false, error: add.stderr || "git add failed" };
  const status = await git(root, ["status", "--porcelain"], signal);
  if (status.ok && status.stdout === "") return { committed: false };
  const commit = await git(root, ["commit", "-m", message, "--quiet"], signal);
  if (!commit.ok) {
    if (identityError(commit.stderr)) {
      await git(root, ["config", "user.name", GIT_IDENTITY.name], signal);
      await git(root, ["config", "user.email", GIT_IDENTITY.email], signal);
      const retry = await git(root, ["commit", "-m", message, "--quiet"], signal);
      if (!retry.ok) return { committed: false, error: retry.stderr || "git commit failed" };
    } else {
      return { committed: false, error: commit.stderr || "git commit failed" };
    }
  }
  const hash = await git(root, ["rev-parse", "--short", "HEAD"], signal);
  return { committed: true, commit: hash.ok ? hash.stdout : undefined };
}

export interface RepoGitStatus {
  dirty: boolean;
  changes: number;
  lastCommit?: { hash: string; date: string; subject: string };
}

export async function gitStatus(root: string, signal?: AbortSignal): Promise<RepoGitStatus> {
  const status = await git(root, ["status", "--porcelain"], signal);
  const lines = status.ok ? status.stdout.split("\n").filter((l) => l.trim().length > 0) : [];
  const result: RepoGitStatus = { dirty: lines.length > 0, changes: lines.length };
  const log = await git(root, ["log", "-1", "--format=%h%x1f%cs%x1f%s"], signal);
  if (log.ok && log.stdout) {
    const [hash, date, ...subject] = log.stdout.split("\x1f");
    result.lastCommit = { hash, date, subject: subject.join("\x1f") };
  }
  return result;
}
