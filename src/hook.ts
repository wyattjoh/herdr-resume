import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgv, type Agent } from "./args";
import { hcJson, label } from "./hc";
import { clearLabels, LABEL, recordLabels } from "./labels";
import type { TerminalView } from "./plan";
import { claudeAncestor } from "./process";

// Claude SessionEnd reasons that mean the person quit on purpose.
const CLAUDE_DELIBERATE = new Set(["prompt_input_exit", "logout", "clear"]);
// How long the background recorder waits for Claude to become the terminal's foreground.
const RECORD_WAIT_MS = 30_000;
const RECORD_POLL_MS = 500;

type ClaudeHookInput = {
  session_id: string | undefined;
  cwd: string | undefined;
  hook_event_name: string | undefined;
  reason: string | undefined;
};

type PiHookInput = {
  event: "start" | "end";
  pid: number;
  session: string | undefined;
  cwd: string;
  argv: string[];
  reason: string | undefined;
};

type ClaudeSessionFile = { kind: string | undefined };

const terminalId = (): string | undefined => process.env.HC_TERMINAL_ID || undefined;

const getTerminal = (address: string): Promise<TerminalView> =>
  hcJson<TerminalView>(["get", address]);

// Clears the record only when it still belongs to this session, so a nested agent never erases the outer one.
async function clearIfOwned(address: string, session: string | undefined): Promise<void> {
  const terminal = await getTerminal(address);
  if (!session || terminal.labels?.[LABEL.session] !== session) return;
  await label(address, clearLabels());
}

async function store(
  address: string,
  agent: Agent,
  session: string,
  cwd: string,
  argv: string[],
): Promise<void> {
  const parsed = parseArgv(agent, argv);
  if (!parsed.interactive) return;
  await label(
    address,
    recordLabels({
      agent,
      session,
      cwd,
      program: parsed.program,
      args: parsed.flags,
      started: Date.now(),
    }),
  );
}

/**
 * Handles a Claude Code SessionStart or SessionEnd hook.
 *
 * SessionStart hands off to a detached `record` process and returns at once, so the hook
 * never delays Claude's startup.
 *
 * @param raw - The hook's JSON input.
 */
export async function claudeHook(raw: string): Promise<void> {
  const address = terminalId();
  if (!address) return;
  const input = JSON.parse(raw) as ClaudeHookInput;
  if (input.hook_event_name === "SessionEnd") {
    if (CLAUDE_DELIBERATE.has(input.reason ?? "")) await clearIfOwned(address, input.session_id);
    return;
  }
  if (input.hook_event_name !== "SessionStart" || !input.session_id) return;
  const pid = await claudeAncestor(process.ppid, 3);
  if (pid === undefined) return;
  spawn(
    process.execPath,
    ["record", "claude", String(pid), input.session_id, input.cwd ?? process.cwd()],
    {
      detached: true,
      stdio: "ignore",
    },
  ).unref();
}

/**
 * Background half of the Claude hook: waits until Claude is the terminal's foreground, then labels it.
 *
 * Requiring Claude to be the foreground keeps a nested `claude` run by a tool from replacing
 * the outer session's record.
 *
 * @param pid - Claude's pid.
 * @param session - Session id.
 * @param cwd - Session folder.
 */
export async function recordClaude(pid: number, session: string, cwd: string): Promise<void> {
  const address = terminalId();
  if (!address) return;
  const deadline = Date.now() + RECORD_WAIT_MS;
  while (Date.now() < deadline) {
    const foreground = (await getTerminal(address)).foreground;
    if (foreground?.pid === pid) {
      const file = Bun.file(join(homedir(), ".claude/sessions", `${pid}.json`));
      const kind = (await file.exists())
        ? ((await file.json()) as ClaudeSessionFile).kind
        : undefined;
      if (kind !== undefined && kind !== "interactive") return;
      await store(address, "claude", session, cwd, foreground.argv);
      return;
    }
    // Another program took the foreground: this Claude is nested or gone.
    if (foreground && foreground.pid !== pid && !(await isAlive(pid))) return;
    await Bun.sleep(RECORD_POLL_MS);
  }
}

async function isAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles a session event from the pi extension.
 *
 * Pi reports its own argv, so no foreground lookup is needed; non-interactive runs
 * (subagents in json or rpc mode) are ignored by the argv parser.
 *
 * @param raw - JSON from the extension.
 */
export async function piHook(raw: string): Promise<void> {
  const address = terminalId();
  if (!address) return;
  const input = JSON.parse(raw) as PiHookInput;
  if (input.event === "end") {
    if (input.reason === "quit") await clearIfOwned(address, input.session);
    return;
  }
  if (!input.session) return;
  await store(address, "pi", input.session, input.cwd, ["pi", ...input.argv]);
}
