import fs from "node:fs";
import path from "node:path";
import { sourcesFile, sourcesFileHeader } from "../config";
import { runCommandSync } from "./commands";
import type { SourceEntry } from "../types";

export const formatPath = (itemPath: string): string => {
  const home = process.env.HOME;
  if (home && itemPath.startsWith(home)) {
    return `~${itemPath.slice(home.length)}`;
  }

  return itemPath;
};

export const expandPath = (inputPath: string): string => {
  if (inputPath === "~") {
    return process.env.HOME ?? inputPath;
  }

  if (inputPath.startsWith("~/")) {
    return `${process.env.HOME ?? ""}/${inputPath.slice(2)}`;
  }

  return inputPath;
};

export const parseSourceEntry = (line: string): SourceEntry => {
  const trimmed = line.trim();
  const match = trimmed.match(/^(parent|scan)\s+(.+)$/);
  const sourcePath = match?.[2] ?? trimmed;
  const expandedPath = expandPath(sourcePath);
  const exists = expandedPath.length > 0 && fs.existsSync(expandedPath);
  const resolvedPath = exists
    ? fs.realpathSync(expandedPath)
    : path.resolve(expandedPath);

  if (!exists) {
    return {
      raw: trimmed,
      path: sourcePath,
      resolvedPath,
      exists: false,
      valid: false,
      issue: "missing",
    };
  }

  const repoRootResult = runCommandSync([
    "git",
    "-C",
    resolvedPath,
    "rev-parse",
    "--show-toplevel",
  ]);
  const repoRoot = repoRootResult.stdout.trim();
  const valid = repoRootResult.success && path.resolve(repoRoot) === resolvedPath;

  return {
    raw: trimmed,
    path: sourcePath,
    resolvedPath,
    exists: true,
    valid,
    issue: valid ? "" : "not a git repo root",
  };
};

export const loadSources = (): SourceEntry[] => {
  fs.mkdirSync(path.dirname(sourcesFile), { recursive: true });

  if (!fs.existsSync(sourcesFile)) {
    return [];
  }

  return fs
    .readFileSync(sourcesFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(parseSourceEntry);
};

export const writeSources = (entries: SourceEntry[]) => {
  const body = entries.map((entry) => `parent ${entry.path}`).join("\n");
  const content =
    body.length > 0
      ? `${sourcesFileHeader}\n${body}\n`
      : `${sourcesFileHeader}\n`;

  fs.mkdirSync(path.dirname(sourcesFile), { recursive: true });
  fs.writeFileSync(sourcesFile, content, "utf8");
};
