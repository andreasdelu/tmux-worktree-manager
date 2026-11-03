import { startTextCommand } from "./commands";

export type PullRequest = {
  number: number;
  url: string;
  state: "open" | "draft" | "closed" | "merged";
  draft: boolean;
  headRef: string;
  baseRef: string;
  headRepo: string | null;
  baseRepo: string;
  mergedAt: string | null;
};

export type PullRequestsReady = {
  status: "ready";
  repository: string;
  pullRequests: PullRequest[];
  // A missing match in recent history is not proof that a branch never had a PR.
  coverage: "complete" | "recent";
};

export type PullRequestsState =
  | { status: "loading" }
  | PullRequestsReady
  | { status: "unavailable"; reason: "missing-gh" | "missing-origin" | "unsupported-remote" }
  | { status: "error"; reason: "command-failed" | "timeout" | "invalid-response" };

const repositoryPattern = /^[a-z\d-]+\/[a-z\d_.-]+$/i;
const repositoryName = (value: unknown): string | null =>
  typeof value === "string" && repositoryPattern.test(value) &&
    ![".", ".."].includes(value.split("/")[1]!)
    ? value.toLowerCase()
    : null;

/** GitHub.com only. Do not guess an identity from arbitrary hosts or URL paths. */
export const parseGitHubRemote = (remote: string): string | null => {
  const match = remote.trim().match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)([^/?#]+\/[^/?#]+?)\/?$/i,
  );
  return match ? repositoryName(match[1]!.replace(/\.git$/i, "")) : null;
};

const query = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number url state isDraft headRefName baseRefName mergedAt
        headRepository { nameWithOwner }
        baseRepository { nameWithOwner }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

class ReaderError extends Error {
  constructor(readonly reason: "command-failed" | "timeout" | "invalid-response") {
    super(reason);
  }
}

// Validate the provider boundary and copy only the requested metadata. Never retain
// raw command stderr or provider error messages for display in the terminal.
const parsePage = (stdout: string) => {
  const invalid = () => { throw new ReaderError("invalid-response"); };
  let payload;
  try { payload = JSON.parse(stdout); } catch { return invalid(); }
  if (payload?.errors) return invalid();
  const connection = payload?.data?.repository?.pullRequests;
  if (!Array.isArray(connection?.nodes) ||
      typeof connection?.pageInfo?.hasNextPage !== "boolean" ||
      (connection.pageInfo.hasNextPage &&
        (typeof connection.pageInfo.endCursor !== "string" || !connection.pageInfo.endCursor))) {
    return invalid();
  }
  const pullRequests: PullRequest[] = connection.nodes.map((node: any) => {
    const baseRepo = repositoryName(node?.baseRepository?.nameWithOwner);
    const headRepo = node?.headRepository === null
      ? null : repositoryName(node?.headRepository?.nameWithOwner);
    if (!baseRepo || (node?.headRepository !== null && !headRepo) ||
        !Number.isSafeInteger(node?.number) || node.number < 1 ||
        typeof node.url !== "string" ||
        node.url.toLowerCase() !== `https://github.com/${baseRepo}/pull/${node.number}` ||
        !["OPEN", "CLOSED", "MERGED"].includes(node.state) ||
        typeof node.isDraft !== "boolean" ||
        ![node.headRefName, node.baseRefName].every(ref =>
          typeof ref === "string" && ref.length > 0 && !/[\x00-\x20\x7f]/.test(ref)) ||
        !(node.mergedAt === null ||
          (typeof node.mergedAt === "string" && Number.isFinite(Date.parse(node.mergedAt))))) {
      return invalid();
    }
    return {
      number: node.number,
      url: node.url,
      state: node.state === "MERGED" || node.mergedAt !== null ? "merged"
        : node.state === "CLOSED" ? "closed" : node.isDraft ? "draft" : "open",
      draft: node.isDraft,
      headRef: node.headRefName,
      baseRef: node.baseRefName,
      headRepo,
      baseRepo,
      mergedAt: node.mergedAt,
    };
  });
  return { pullRequests, ...connection.pageInfo } as {
    pullRequests: PullRequest[]; hasNextPage: boolean; endCursor: string | null;
  };
};

type Command = {
  promise: Promise<{ stdout: string; stderr: string; exitCode: number }>;
  proc: { kill: () => unknown };
};

/** Factory isolates caches and permits offline adapter tests without global mocks. */
export const createPullRequestReader = (dependencies: {
  startCommand?: (cmd: string[]) => Command;
  which?: (name: string) => string | null;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
} = {}) => {
  const start = dependencies.startCommand ?? startTextCommand;
  const which = dependencies.which ?? Bun.which;
  const now = dependencies.now ?? Date.now;
  const ttlMs = dependencies.ttlMs ?? 60_000;
  const timeoutMs = dependencies.timeoutMs ?? 8_000;
  const states = new Map<string, PullRequestsState>();
  const rootsPending = new Map<string, Promise<PullRequestsState>>();
  const cache = new Map<string, { state: PullRequestsState; expires: number }>();
  const reposPending = new Map<string, Promise<PullRequestsState>>();
  const activeCommands = new Set<Command>();
  let generation = 0;

  const run = async (cmd: string[], deadline: number, requestGeneration: number) => {
    if (generation !== requestGeneration) throw new ReaderError("command-failed");
    const remaining = deadline - now();
    if (remaining <= 0) throw new ReaderError("timeout");
    const command = start(cmd);
    activeCommands.add(command);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        command.promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            try { command.proc.kill(); } catch { /* already exited */ }
            reject(new ReaderError("timeout"));
          }, remaining);
        }),
      ]);
      return result;
    } finally {
      clearTimeout(timer);
      activeCommands.delete(command);
    }
  };

  const readRepository = async (gh: string, repository: string, deadline: number, requestGeneration: number): Promise<PullRequestsState> => {
    try {
      const [owner, name] = repository.split("/");
      const pullRequests: PullRequest[] = [];
      let cursor: string | null = null;
      // Bound history and total elapsed time, rather than paging a large repo forever.
      for (let page = 0; page < 3; page++) {
        const cmd = [gh, "api", "graphql", "--hostname", "github.com", "-f", `query=${query}`,
          "-f", `owner=${owner}`, "-f", `name=${name}`];
        if (cursor) cmd.push("-f", `cursor=${cursor}`);
        const result = await run(cmd, deadline, requestGeneration);
        if (result.exitCode !== 0) throw new ReaderError("command-failed");
        const data = parsePage(result.stdout);
        if (data.pullRequests.some(pr => pr.baseRepo !== repository)) {
          throw new ReaderError("invalid-response");
        }
        pullRequests.push(...data.pullRequests);
        if (!data.hasNextPage || page === 2) {
          return { status: "ready", repository, pullRequests,
            coverage: data.hasNextPage ? "recent" : "complete" };
        }
        if (data.endCursor === cursor) throw new ReaderError("invalid-response");
        cursor = data.endCursor;
      }
      throw new ReaderError("invalid-response");
    } catch (error) {
      return { status: "error", reason: error instanceof ReaderError ? error.reason : "command-failed" };
    }
  };

  const loadPullRequests = (repoRoot: string, { refresh = false }: { refresh?: boolean } = {}): Promise<PullRequestsState> => {
    const pending = rootsPending.get(repoRoot);
    if (pending) return pending;
    states.set(repoRoot, { status: "loading" });
    const requestGeneration = generation;
    const request = (async (): Promise<PullRequestsState> => {
      try {
        const gh = which("gh");
        if (!gh) return { status: "unavailable", reason: "missing-gh" };
        const deadline = now() + timeoutMs;
        const origin = await run(["git", "-C", repoRoot, "remote", "get-url", "origin"], deadline, requestGeneration);
        if (origin.exitCode !== 0 || !origin.stdout.trim()) {
          return { status: "unavailable", reason: "missing-origin" };
        }
        const repository = parseGitHubRemote(origin.stdout);
        if (!repository) return { status: "unavailable", reason: "unsupported-remote" };
        const inFlight = reposPending.get(repository);
        if (inFlight) return await inFlight;
        const cached = cache.get(repository);
        if (!refresh && cached && cached.expires > now()) return cached.state;
        const read = readRepository(gh, repository, deadline, requestGeneration);
        reposPending.set(repository, read);
        try {
          const state = await read;
          // Cache failures too so offline redraws do not hammer gh. Refresh retries.
          if (generation === requestGeneration) cache.set(repository, { state, expires: now() + ttlMs });
          return state;
        } finally {
          reposPending.delete(repository);
        }
      } catch (error) {
        return { status: "error", reason: error instanceof ReaderError ? error.reason : "command-failed" };
      }
    })().then(state => {
      states.set(repoRoot, state);
      rootsPending.delete(repoRoot);
      return state;
    });
    rootsPending.set(repoRoot, request);
    return request;
  };

  const cancel = () => {
    generation++;
    for (const command of activeCommands) {
      try { command.proc.kill(); } catch { /* already exited */ }
    }
  };
  return { loadPullRequests, cancel, getPullRequestsState: (repoRoot: string) => states.get(repoRoot) };
};

// No commands or network work until explicitly loaded by a caller.
const reader = createPullRequestReader();
export const loadPullRequests = reader.loadPullRequests;
export const getPullRequestsState = reader.getPullRequestsState;
export const cancelPullRequestLoads = reader.cancel;

const active = (pr: PullRequest) => pr.state === "open" || pr.state === "draft";
const sameRepository = (pr: PullRequest, repository: string) =>
  pr.headRepo?.toLowerCase() === repository.toLowerCase() &&
  pr.baseRepo.toLowerCase() === repository.toLowerCase();

export type BranchPullRequest =
  | { status: "matched"; pullRequest: PullRequest }
  | { status: "no-pr"; coverage: PullRequestsReady["coverage"] };

/** Active PRs win over historical reuse of a branch; then prefer newest PR number. */
export const matchPullRequestForBranch = (data: PullRequestsReady, branch: string): BranchPullRequest => {
  const matches = data.pullRequests.filter(pr =>
    sameRepository(pr, data.repository) && pr.headRef === branch);
  matches.sort((a, b) => Number(active(b)) - Number(active(a)) || b.number - a.number);
  return matches[0] ? { status: "matched", pullRequest: matches[0] }
    : { status: "no-pr", coverage: data.coverage };
};

/** Active stacks only: closed/merged history cannot invent current dependencies.
 * Parents are nearest first; children are depth-first descendants. Edges are PR
 * head/base matches, not Git ancestry. All results inherit the reader's coverage.
 */
export const derivePullRequestStack = (data: PullRequestsReady, branch: string) => {
  const current = matchPullRequestForBranch(data, branch);
  const parents: PullRequest[] = [];
  const children: PullRequest[] = [];
  let cycle = false;
  if (current.status !== "matched" || !active(current.pullRequest)) {
    return { current, parents, children, cycle };
  }
  const byHead = new Map<string, PullRequest>();
  for (const pr of [...data.pullRequests].sort((a, b) => b.number - a.number)) {
    if (active(pr) && sameRepository(pr, data.repository) && !byHead.has(pr.headRef)) {
      byHead.set(pr.headRef, pr);
    }
  }
  const seenParents = new Set([branch]);
  let parent = byHead.get(current.pullRequest.baseRef);
  while (parent) {
    if (seenParents.has(parent.headRef)) { cycle = true; break; }
    seenParents.add(parent.headRef);
    parents.push(parent);
    parent = byHead.get(parent.baseRef);
  }
  const seenChildren = new Set([branch]);
  const visit = (head: string) => {
    for (const pr of byHead.values()) {
      if (pr.baseRef !== head) continue;
      if (seenChildren.has(pr.headRef)) { cycle = true; continue; }
      seenChildren.add(pr.headRef);
      children.push(pr);
      visit(pr.headRef);
    }
  };
  visit(branch);
  return { current, parents, children, cycle };
};
