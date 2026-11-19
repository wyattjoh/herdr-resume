import { LABEL, readRecord, type ResumeRecord } from "./labels";
import { quote } from "./shell";

/**
 * The parts of an `hc get --json` terminal that planning uses.
 */
export type TerminalView = {
  address: string;
  state: string;
  labels: Record<string, string> | undefined;
  foreground: { argv: string[]; cwd: string; pid: number } | null | undefined;
};

/**
 * A terminal that should get its agent back.
 */
export type Candidate = {
  address: string;
  machine: string | undefined;
  record: ResumeRecord;
  boot: number;
  line: string;
};

/**
 * A terminal with resume labels that is left alone, and why.
 */
export type Skip = {
  address: string;
  reason: string;
};

const SHELLS = new Set(["zsh", "bash", "sh", "dash", "ksh", "fish", "nu", "tcsh"]);

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1).replace(/^-/, "");

/**
 * Whether a terminal's foreground is an idle login shell (what keep recovery leaves).
 *
 * @param foreground - The terminal's foreground process.
 * @returns True for a shell such as `/bin/zsh -l`.
 */
export function isBareShell(foreground: TerminalView["foreground"]): boolean {
  if (!foreground?.argv.length) return false;
  return SHELLS.has(basename(foreground.argv[0]!));
}

/**
 * The machine part of a terminal address (`vps/t12` → `vps`).
 *
 * @param address - A terminal address.
 * @returns The machine name, or undefined for this computer.
 */
export function machineOf(address: string): string | undefined {
  const slash = address.indexOf("/");
  return slash > 0 ? address.slice(0, slash) : undefined;
}

/**
 * The shell line that reopens a record's session.
 *
 * @param record - What to resume.
 * @returns `cd <cwd> && <program> <flags> --resume <id>` (pi: `--session <file>`).
 */
export function resumeLine(record: ResumeRecord): string {
  const selector = record.agent === "claude" ? "--resume" : "--session";
  const words = [record.program, ...record.args, selector, record.session];
  return `cd ${quote(record.cwd)} && ${words.map(quote).join(" ")}`;
}

/**
 * Options for {@link selectCandidates}.
 */
export type SelectOptions = {
  /**
   * Skip the boot-time and already-attempted checks (manual runs and tests).
   */
  force: boolean;
};

/**
 * Picks the terminals whose agent was lost to a reboot.
 *
 * A terminal qualifies when it carries a resume record, is live, has a bare shell in front,
 * its session started before that machine's last boot, and no resume was tried since that boot.
 *
 * @param terminals - Terminals from `hc get --json`.
 * @param boots - Boot time (epoch ms) per machine; the key undefined is this computer.
 * @param options - See {@link SelectOptions}.
 * @returns Terminals to resume and labelled terminals that were skipped.
 */
export function selectCandidates(
  terminals: readonly TerminalView[],
  boots: ReadonlyMap<string | undefined, number | undefined>,
  options: SelectOptions,
): { resume: Candidate[]; skipped: Skip[] } {
  const resume: Candidate[] = [];
  const skipped: Skip[] = [];
  for (const terminal of terminals) {
    const record = readRecord(terminal.labels);
    if (!record) continue;
    const skip = (reason: string) => skipped.push({ address: terminal.address, reason });
    const machine = machineOf(terminal.address);
    const boot = boots.get(machine);
    if (terminal.state !== "live") {
      skip(`not live (${terminal.state})`);
      continue;
    }
    if (!isBareShell(terminal.foreground)) {
      skip("agent or another program is still running");
      continue;
    }
    if (!options.force && boot === undefined) {
      skip("boot time unknown");
      continue;
    }
    if (!options.force && record.started >= boot!) {
      skip("session started after the last boot");
      continue;
    }
    if (!options.force && terminal.labels?.[LABEL.attempt] === String(boot)) {
      skip("already attempted since the last boot");
      continue;
    }
    resume.push({
      address: terminal.address,
      machine,
      record,
      boot: boot ?? 0,
      line: resumeLine(record),
    });
  }
  return { resume, skipped };
}

/**
 * Parses a boot time from `sysctl -n kern.boottime` (macOS) or `/proc/stat` btime (Linux).
 *
 * @param text - Command output.
 * @returns Boot time in epoch milliseconds, or undefined.
 */
export function parseBoot(text: string): number | undefined {
  const match = /sec = (\d+)/.exec(text) ?? /^\s*(\d+)\s*$/m.exec(text);
  return match ? Number(match[1]) * 1000 : undefined;
}
