import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./hc";

async function parentOf(pid: number): Promise<number | undefined> {
  const result = await run(["ps", "-o", "ppid=", "-p", String(pid)]);
  const parent = Number(result.stdout.trim());
  return result.code === 0 && parent > 0 ? parent : undefined;
}

async function looksLikeClaude(pid: number): Promise<boolean> {
  if (await Bun.file(join(homedir(), ".claude/sessions", `${pid}.json`)).exists()) return true;
  const result = await run(["ps", "-o", "comm=", "-p", String(pid)]);
  const name = result.stdout.trim().replace(/^.*\//, "");
  // The native installer runs a binary named after its version, e.g. 2.1.327.
  return name === "claude" || /^\d+\.\d+\.\d+/.test(name);
}

/**
 * Finds the Claude Code process that ran this hook.
 *
 * @param start - The hook's parent pid.
 * @param depth - How many generations to check (claude → shell → hook).
 * @returns Claude's pid, or undefined when no near ancestor is Claude.
 */
export async function claudeAncestor(start: number, depth: number): Promise<number | undefined> {
  let current: number | undefined = start;
  for (let step = 0; current !== undefined && step <= depth; step += 1) {
    if (await looksLikeClaude(current)) return current;
    current = await parentOf(current);
  }
  return undefined;
}
