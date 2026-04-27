import fs from "node:fs";
import { updateCheckFile } from "../config";
import { currentVersion } from "../version";

const updateCheckTtlMs = 24 * 60 * 60 * 1000;
const updateCheckTimeoutMs = 1_500;
const tagsUrl = "https://api.github.com/repos/andreasdelu/tmux-worktree-manager/tags";

type UpdateCache = {
  checkedAt: number;
  latestVersion: string;
};

const normalizeVersion = (version: string) => version.trim().replace(/^v/i, "");

const compareVersions = (left: string, right: string) => {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number(part) || 0);
  const rightParts = normalizeVersion(right).split(".").map((part) => Number(part) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index++) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
};

const readCache = (): UpdateCache | null => {
  try {
    const cache = JSON.parse(fs.readFileSync(updateCheckFile, "utf8")) as UpdateCache;

    if (typeof cache.checkedAt === "number" && typeof cache.latestVersion === "string") {
      return cache;
    }
  } catch {
    // Ignore missing or stale cache files.
  }

  return null;
};

const writeCache = (latestVersion: string) => {
  try {
    fs.writeFileSync(
      updateCheckFile,
      `${JSON.stringify({ checkedAt: Date.now(), latestVersion }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Update checks should never block the app.
  }
};

const latestFromCache = (cache: UpdateCache | null) => {
  if (!cache) {
    return null;
  }

  return Date.now() - cache.checkedAt < updateCheckTtlMs
    ? cache.latestVersion
    : null;
};

const fetchLatestTag = async () => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), updateCheckTimeoutMs);

  try {
    const response = await fetch(tagsUrl, {
      headers: { Accept: "application/vnd.github+json" },
      signal: abortController.signal,
    });

    if (!response.ok) {
      return null;
    }

    const tags = await response.json() as Array<{ name?: string }>;
    const latestTag = tags
      .map((tag) => tag.name)
      .find((name): name is string => typeof name === "string" && /^v?\d+\.\d+\.\d+/.test(name));

    return latestTag ? normalizeVersion(latestTag) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const checkForUpdate = async () => {
  const cache = readCache();
  const cachedLatestVersion = latestFromCache(cache);
  const latestVersion = cachedLatestVersion ?? await fetchLatestTag();

  if (!latestVersion) {
    return null;
  }

  if (!cachedLatestVersion) {
    writeCache(latestVersion);
  }

  return compareVersions(latestVersion, currentVersion) > 0
    ? latestVersion
    : null;
};
