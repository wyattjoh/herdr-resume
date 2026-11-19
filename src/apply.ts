import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgv } from "./args";
import { hc, hcJson, label, run } from "./hc";
import { LABEL, readRecord, recordLabels } from "./labels";
import {
  machineOf,
  parseBoot,
  selectCandidates,
  type Candidate,
  type Skip,
  type TerminalView,
} from "./plan";

const BOOT_SCRIPT = "sysctl -n kern.boottime 2>/dev/null || awk '/^btime/{print $2}' /proc/stat";

type Listing = { terminals: { address: string; state: string }[] };

/**
 * Fetches every live terminal, with labels and foreground process.
 *
 * @returns Terminal details from `hc get`.
 */
async function liveTerminals(): Promise<TerminalView[]> {
  const listing = await hcJson<Listing>(["ls"]);
  const live = listing.terminals.filter((t) => t.state === "live");
  const details = await Promise.all(
    live.map((t) => hcJson<TerminalView>(["get", t.address]).catch(() => undefined)),
  );
  return details.filter((t): t is TerminalView => t !== undefined);
}

async function bootOf(machine: string | undefined): Promise<number | undefined> {
  const result = machine
    ? await hc(["exec", "--on", machine, "sh", "-c", BOOT_SCRIPT])
    : await run(["sh", "-c", BOOT_SCRIPT]);
  return result.code === 0 ? parseBoot(result.stdout) : undefined;
}

/**
 * Looks up the boot time of every machine that has a labelled terminal.
 *
 * @param terminals - Terminals to consider.
 * @returns Boot time (epoch ms) per machine; undefined key is this computer.
 */
async function boots(
  terminals: readonly TerminalView[],
): Promise<Map<string | undefined, number | undefined>> {
  const machines = [
    ...new Set(terminals.filter((t) => readRecord(t.labels)).map((t) => machineOf(t.address))),
  ];
  const entries = await Promise.all(machines.map(async (m) => [m, await bootOf(m)] as const));
  return new Map(entries);
}

/**
 * The outcome of a plan or apply run.
 */
export type Report = {
  resumed: { address: string; agent: string; line: string }[];
  failed: { address: string; error: string }[];
  skipped: Skip[];
};

/**
 * Finds terminals to resume and, unless `dryRun`, types the resume command into each.
 *
 * Each terminal is marked with the boot it was attempted for before typing, so another
 * window or a later run never resumes it twice.
 *
 * @param options - `force` skips boot checks; `dryRun` only reports; `only` limits to one address.
 * @returns What was (or would be) resumed, what failed, and what was skipped.
 */
export async function apply(options: {
  force: boolean;
  dryRun: boolean;
  only: string | undefined;
}): Promise<Report> {
  const all = await liveTerminals();
  const terminals = options.only ? all.filter((t) => t.address === options.only) : all;
  const { resume, skipped } = selectCandidates(terminals, await boots(terminals), {
    force: options.force,
  });
  const report: Report = { resumed: [], failed: [], skipped };
  const done = (c: Candidate) =>
    report.resumed.push({ address: c.address, agent: c.record.agent, line: c.line });
  if (options.dryRun) {
    resume.forEach(done);
    return report;
  }
  await Promise.all(
    resume.map(async (candidate) => {
      try {
        await label(candidate.address, [`${LABEL.attempt}=${candidate.boot}`]);
        const sent = await hc(["send", candidate.address, candidate.line]);
        if (sent.code !== 0) throw new Error((sent.stderr || sent.stdout).trim());
        done(candidate);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.failed.push({ address: candidate.address, error: message });
        await label(candidate.address, [`${LABEL.error}=${message}`]).catch(() => undefined);
      }
    }),
  );
  return report;
}

type ClaudeSession = {
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string | undefined;
};

/**
 * Labels Claude agents that were already running before the hooks were installed.
 *
 * @param dryRun - Only report what would be labelled.
 * @returns Labelled addresses, and pi agents that need one restart instead.
 */
export async function backfill(
  dryRun: boolean,
): Promise<{ labelled: string[]; restartPi: string[] }> {
  const terminals = (await liveTerminals()).filter(
    (t) => !machineOf(t.address) && !readRecord(t.labels),
  );
  const labelled: string[] = [];
  const restartPi: string[] = [];
  for (const terminal of terminals) {
    const fg = terminal.foreground;
    if (!fg) continue;
    const file = Bun.file(join(homedir(), ".claude/sessions", `${fg.pid}.json`));
    if (await file.exists()) {
      const session = (await file.json()) as ClaudeSession;
      const parsed = parseArgv("claude", fg.argv);
      if (session.kind !== "interactive" || !parsed.interactive) continue;
      labelled.push(terminal.address);
      if (dryRun) continue;
      await label(
        terminal.address,
        recordLabels({
          agent: "claude",
          session: session.sessionId,
          cwd: session.cwd,
          program: parsed.program,
          args: parsed.flags,
          started: session.startedAt,
        }),
      );
      continue;
    }
    if (/(^|\/)pi$/.test(fg.argv[0] ?? "")) restartPi.push(terminal.address);
  }
  return { labelled, restartPi };
}
