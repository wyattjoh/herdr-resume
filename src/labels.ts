import type { Agent } from "./args";

/**
 * Terminal label keys herdr-resume reads and writes.
 */
export const LABEL = {
  agent: "resume.agent",
  session: "resume.session",
  cwd: "resume.cwd",
  program: "resume.program",
  args: "resume.args",
  started: "resume.started",
  attempt: "resume.attempt",
  error: "resume.error",
} as const;

/**
 * What an agent terminal needs to resume its session.
 */
export type ResumeRecord = {
  /**
   * Which agent ran.
   */
  agent: Agent;
  /**
   * Claude: session id. Pi: session file path.
   */
  session: string;
  /**
   * Folder the session belongs to.
   */
  cwd: string;
  /**
   * Program as originally invoked.
   */
  program: string;
  /**
   * Flags to repeat on resume.
   */
  args: string[];
  /**
   * When the session started, in epoch milliseconds.
   */
  started: number;
};

/**
 * Turns a record into `hc label` arguments.
 *
 * @param record - The record to store.
 * @returns key=value pairs; the attempt and error markers are cleared.
 */
export function recordLabels(record: ResumeRecord): string[] {
  return [
    `${LABEL.agent}=${record.agent}`,
    `${LABEL.session}=${record.session}`,
    `${LABEL.cwd}=${record.cwd}`,
    `${LABEL.program}=${record.program}`,
    `${LABEL.args}=${JSON.stringify(record.args)}`,
    `${LABEL.started}=${record.started}`,
    `${LABEL.attempt}=`,
    `${LABEL.error}=`,
  ];
}

/**
 * `hc label` arguments that remove every herdr-resume label.
 *
 * @returns key= pairs.
 */
export function clearLabels(): string[] {
  return Object.values(LABEL).map((key) => `${key}=`);
}

const parseArgs = (raw: string | undefined): string[] | undefined => {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Reads a record back from a terminal's labels.
 *
 * @param labels - The terminal's labels.
 * @returns The record, or undefined when labels are missing or malformed.
 */
export function readRecord(labels: Record<string, string> | undefined): ResumeRecord | undefined {
  if (!labels) return undefined;
  const agent = labels[LABEL.agent];
  if (agent !== "claude" && agent !== "pi") return undefined;
  const session = labels[LABEL.session];
  const cwd = labels[LABEL.cwd];
  const started = Number(labels[LABEL.started]);
  const args = parseArgs(labels[LABEL.args]);
  if (!session || !cwd || !Number.isFinite(started) || !args) return undefined;
  return { agent, session, cwd, program: labels[LABEL.program] || agent, args, started };
}
