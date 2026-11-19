// herdr-resume pi extension: records the session in the Herdr terminal's labels so
// herdr-resume can reopen it after a reboot. Installed from the herdr-resume repo.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const BIN = process.env.HERDR_RESUME_BIN ?? join(homedir(), ".local/bin/herdr-resume");

type Payload = {
  event: "start" | "end";
  pid: number;
  session: string | undefined;
  cwd: string;
  argv: string[];
  reason: string | undefined;
};

function report(payload: Payload): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(BIN, ["hook", "pi"], { stdio: ["pipe", "ignore", "ignore"] });
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 3000);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    child.on("error", finish);
    child.on("close", finish);
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * Registers session start/shutdown handlers when pi runs inside a Herdr terminal.
 *
 * @param pi - The pi extension API.
 */
export default function herdrResume(pi: any): void {
  if (!process.env.HC_TERMINAL_ID) return;
  let signaled = false;
  const mark = () => {
    signaled = true;
  };
  const base = { pid: process.pid, argv: process.argv.slice(2) };

  let session: string | undefined;

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    session = ctx?.sessionManager?.getSessionFile?.() ?? undefined;
    // Only listen when pi itself handles these signals; a lone listener would stop the default exit.
    for (const signal of ["SIGTERM", "SIGHUP"] as const) {
      if (process.listenerCount(signal) > 0 && !process.listeners(signal).includes(mark))
        process.on(signal, mark);
    }
    await report({
      ...base,
      event: "start",
      session,
      cwd: ctx?.cwd ?? process.cwd(),
      reason: undefined,
    });
  });

  pi.on("session_shutdown", async (event: { reason?: string }) => {
    // A quit from a signal (shutdown, terminal loss) keeps the record so the session can be resumed.
    if (event?.reason !== "quit" || signaled) return;
    await report({ ...base, event: "end", session, cwd: process.cwd(), reason: "quit" });
  });
}
