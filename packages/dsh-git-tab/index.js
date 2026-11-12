/**
 * Read-only Git inspection over Connection Fetch routes.
 *
 * A Workspace is a root directory, not a repository: it commonly holds several
 * checkouts (e.g. `apps/api` and `apps/web`). Every route therefore takes the
 * scanned **root** plus one repository directory from that scan, and the Host
 * re-validates that the repository really sits inside the root before running
 * any git command there.
 *
 * No mutation routes: this plugin only reads branches, working-tree changes,
 * diffs, and history.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const ROUTES = {
  repos: "/api/git.repos",
  repo: "/api/git.repo",
  diff: "/api/git.diff",
  show: "/api/git.show",
};

const MAX_REPOS = 40;
const MAX_SCAN_DEPTH = 3;
const MAX_DIFF_BYTES = 400 * 1024;
const MAX_SHOW_BYTES = 400 * 1024;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "vendor",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".cache",
  ".next",
  ".nuxt",
  ".turbo",
  ".parcel-cache",
  ".pnpm-store",
  ".yarn",
  ".svelte-kit",
  ".idea",
  ".vscode",
  "site-packages",
  ".gradle",
  ".m2",
  "Pods",
  "DerivedData",
]);
const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function fail(message, code = "git/bad-request", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}

function errorResponse(error) {
  return json(
    {
      error: {
        code: typeof error?.code === "string" ? error.code : "git/error",
        message: error instanceof Error ? error.message : String(error),
      },
    },
    typeof error?.status === "number" ? error.status : 500,
  );
}

function run(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
          GIT_PAGER: "cat",
          LC_ALL: "C",
        },
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          message: error?.message || "",
        });
      },
    );
  });
}

function hasGitDir(dir) {
  try {
    fs.accessSync(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(dir) {
  try {
    return (await fsp.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function scanRepos(root) {
  const found = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0 && found.length < MAX_REPOS) {
    const { dir, depth } = queue.shift();
    if (hasGitDir(dir)) {
      found.push(dir);
      continue;
    }
    if (depth >= MAX_SCAN_DEPTH) continue;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return found;
}

async function assertRoot(raw) {
  const root = typeof raw === "string" ? raw.trim() : "";
  if (!root || !path.isAbsolute(root)) fail("root must be an absolute directory path", "git/bad-root");
  const resolved = await fsp.realpath(root).catch(() => fail(`root is not a directory: ${root}`, "git/bad-root"));
  if (!(await isDirectory(resolved))) fail(`root is not a directory: ${root}`, "git/bad-root");
  return resolved;
}

/** Re-validate that `repo` is one of this root's checkouts. */
async function assertRepo(root, raw) {
  const repo = typeof raw === "string" ? raw.trim() : "";
  if (!repo || !path.isAbsolute(repo)) fail("repo must be an absolute directory path", "git/bad-repo");
  const resolved = await fsp.realpath(repo).catch(() => fail(`repo not found: ${repo}`, "git/bad-repo"));
  const inside = resolved === root || resolved.startsWith(`${root}${path.sep}`);
  if (!inside) fail("repo is outside the scanned root", "git/bad-repo", 403);
  if (!hasGitDir(resolved)) fail(`not a git checkout: ${repo}`, "git/bad-repo");
  return resolved;
}

function parseStatus(output) {
  const parts = output.split("\0");
  const changes = [];
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index];
    if (!entry) continue;
    const x = entry[0];
    const y = entry[1];
    if (x === "!" && y === "!") continue;
    const file = entry.slice(3);
    let origPath = null;
    if (x === "R" || x === "C") {
      origPath = parts[index + 1] || null;
      index += 1;
    }
    const untracked = x === "?" && y === "?";
    const code = `${x}${y}`;
    const staged = !untracked && x !== " " && x !== "?";
    const unstaged = !untracked && y !== " " && y !== "?";
    changes.push({
      path: file,
      origPath,
      indexStatus: x,
      worktreeStatus: y,
      status: untracked ? "??" : code,
      staged,
      unstaged,
      untracked,
      conflicted: CONFLICT_CODES.has(code),
    });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return changes;
}

function parseBranches(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, head, upstream, date] = line.split("\x1f");
      return {
        name,
        current: head === "*",
        upstream: upstream || null,
        date: date || null,
      };
    })
    .filter((branch) => branch.name);
}

function parseLog(output) {
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, author, date, subject] = record.split("\x1f");
      return { hash, shortHash, author, date, subject };
    })
    .filter((commit) => commit.hash);
}

async function branchInfo(repo) {
  const symbolic = await run(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const detachedHead = await run(repo, ["rev-parse", "--short", "HEAD"]);
  const branch = symbolic.ok ? symbolic.stdout.trim() : `detached@${detachedHead.stdout.trim() || "?"}`;
  const upstreamResult = await run(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstream = upstreamResult.ok ? upstreamResult.stdout.trim() : null;
  let ahead = null;
  let behind = null;
  if (upstream) {
    const counts = await run(repo, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
    if (counts.ok) {
      const [behindText, aheadText] = counts.stdout.trim().split(/\s+/);
      behind = Number.parseInt(behindText, 10);
      ahead = Number.parseInt(aheadText, 10);
    }
  }
  return { branch, detached: !symbolic.ok, upstream, ahead, behind };
}

async function repoDetail(root, repo, limit) {
  const rel = path.relative(root, repo) || ".";
  const [branch, status, log, branchList] = await Promise.all([
    branchInfo(repo),
    run(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    run(repo, ["log", "-n", String(limit), "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e"]),
    run(repo, ["branch", "--format=%(refname:short)%x1f%(HEAD)%x1f%(upstream:short)%x1f%(committerdate:iso8601)"]),
  ]);
  if (!status.ok) {
    return {
      path: repo,
      name: path.basename(repo),
      relPath: rel,
      error: status.stderr.trim() || status.message || "git status failed",
    };
  }
  const changes = parseStatus(status.stdout);
  const counts = {
    total: changes.length,
    staged: changes.filter((change) => change.staged).length,
    unstaged: changes.filter((change) => change.unstaged).length,
    untracked: changes.filter((change) => change.untracked).length,
    conflicted: changes.filter((change) => change.conflicted).length,
  };
  const commits = log.ok ? parseLog(log.stdout) : [];
  const branches = branchList.ok ? parseBranches(branchList.stdout) : [];
  return {
    path: repo,
    name: path.basename(repo),
    relPath: rel,
    ...branch,
    counts,
    changes,
    commits,
    branches,
    clean: changes.length === 0,
  };
}

function clip(text) {
  if (typeof text !== "string") return { text: "", truncated: false };
  if (Buffer.byteLength(text, "utf8") <= MAX_DIFF_BYTES) return { text, truncated: false };
  return { text: text.slice(0, MAX_DIFF_BYTES), truncated: true };
}

function safeRepoPath(repo, file) {
  if (typeof file !== "string" || !file.trim()) fail("path is required", "git/bad-path");
  const resolved = path.resolve(repo, file);
  if (resolved !== repo && !resolved.startsWith(`${repo}${path.sep}`)) {
    fail("path is outside the repository", "git/bad-path", 403);
  }
  return resolved;
}

async function readUntracked(repo, file) {
  const absolute = safeRepoPath(repo, file);
  const stat = await fsp.stat(absolute).catch(() => null);
  if (!stat) fail(`file not found: ${file}`, "git/bad-path", 404);
  if (stat.isDirectory()) {
    return { text: `diff --git a/${file} b/${file}\nnew file mode 040000\n(directory)\n`, truncated: false };
  }
  if (stat.size > MAX_DIFF_BYTES) {
    const head = await fsp.readFile(absolute, "utf8").catch(() => "");
    return {
      text: [`diff --git a/${file} b/${file}`, "new file mode 100644", "--- /dev/null", `+++ b/${file}`, ...head.slice(0, MAX_DIFF_BYTES).split("\n").map((line) => `+${line}`)].join("\n"),
      truncated: true,
    };
  }
  const content = await fsp.readFile(absolute, "utf8").catch(() => null);
  if (content === null) return { text: `diff --git a/${file} b/${file}\n(binary or unreadable file)\n`, truncated: false };
  if (content.includes("\u0000")) {
    return { text: `diff --git a/${file} b/${file}\nnew file mode 100644\n(binary file)\n`, truncated: false };
  }
  const lines = content.split("\n");
  return {
    text: [
      `diff --git a/${file} b/${file}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${file}`,
      ...lines.map((line) => `+${line}`),
    ].join("\n"),
    truncated: false,
  };
}

function query(request) {
  return new URL(request.url).searchParams;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const register = (routePath, handler) => {
    ctx.effect(
      () =>
        ctx.connection.fetch.register({
          path: routePath,
          methods: ["GET"],
          requestBody: "buffered",
          fetch: async (request) => {
            try {
              return await handler(request);
            } catch (error) {
              return errorResponse(error);
            }
          },
        }),
      `git: ${routePath}`,
    );
  };

  register(ROUTES.repos, async (request) => {
    const root = await assertRoot(query(request).get("root"));
    const repos = (await scanRepos(root)).map((repo) => ({
      path: repo,
      name: path.basename(repo),
      relPath: path.relative(root, repo) || ".",
    }));
    return json({ root, repos });
  });

  register(ROUTES.repo, async (request) => {
    const params = query(request);
    const root = await assertRoot(params.get("root"));
    const repo = await assertRepo(root, params.get("repo"));
    const rawLimit = Number.parseInt(params.get("limit") || "12", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 12;
    return json({ repo: await repoDetail(root, repo, limit) });
  });

  register(ROUTES.diff, async (request) => {
    const params = query(request);
    const root = await assertRoot(params.get("root"));
    const repo = await assertRepo(root, params.get("repo"));
    const file = params.get("path") || "";
    const mode = params.get("mode") || "worktree";
    safeRepoPath(repo, file);
    if (mode === "untracked") {
      const result = await readUntracked(repo, file);
      const clipped = clip(result.text);
      return json({ diff: clipped.text, truncated: result.truncated || clipped.truncated, mode });
    }
    const args =
      mode === "staged"
        ? ["diff", "--cached", "--no-color", "--unified=3", "--", file]
        : ["diff", "--no-color", "--unified=3", "--", file];
    const result = await run(repo, args);
    if (!result.ok && result.stdout === "") {
      fail(result.stderr.trim() || "git diff failed", "git/diff-failed", 500);
    }
    const clipped = clip(result.stdout);
    return json({ diff: clipped.text, truncated: clipped.truncated, mode });
  });

  register(ROUTES.show, async (request) => {
    const params = query(request);
    const root = await assertRoot(params.get("root"));
    const repo = await assertRepo(root, params.get("repo"));
    const hash = (params.get("hash") || "").trim();
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) fail("hash must be a commit id", "git/bad-hash");
    const result = await run(repo, [
      "show",
      "--no-color",
      "--stat=160",
      "--patch",
      "--format=commit %H%nAuthor: %an <%ae>%nDate:   %aI%n%n%B",
      hash,
    ]);
    if (!result.ok && result.stdout === "") {
      fail(result.stderr.trim() || "git show failed", "git/show-failed", 500);
    }
    const clipped = clip(result.stdout);
    return json({ patch: clipped.text, truncated: clipped.truncated, hash });
  });
}

export const inject = ["connection"];
