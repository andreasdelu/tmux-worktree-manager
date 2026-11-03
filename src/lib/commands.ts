import type { Subprocess } from "bun";
import { hostCommand } from "./popup";

const ansiRegex = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export const runCommandSync = (cmd: string[]) => {
  const proc = Bun.spawnSync({
    cmd: hostCommand(cmd),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
    success: proc.exitCode === 0,
  };
};

export const stripAnsi = (text: string) => text.replace(ansiRegex, "");

export const startTextCommand = (cmd: string[], processes?: Subprocess[]) => {
  const proc = Bun.spawn({
    cmd: hostCommand(cmd),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  processes?.push(proc);

  return {
    proc,
    promise: Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]).then(([stdout, stderr, exitCode]) => ({ stdout, stderr, exitCode })),
  };
};

export const runCommand = async (cmd: string[]) => {
  try {
    const { stdout, stderr, exitCode } = await startTextCommand(cmd).promise;
    return { stdout, stderr, exitCode, success: exitCode === 0 };
  } catch (error) {
    return { stdout: "", stderr: error instanceof Error ? error.message : "Command failed", exitCode: -1, success: false };
  }
};

export const waitForPaint = () =>
  new Promise((resolve) => setTimeout(resolve, 0));
