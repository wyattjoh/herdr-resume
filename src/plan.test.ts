import { describe, expect, test } from "bun:test";
import { recordLabels, type ResumeRecord } from "./labels";
import {
  isBareShell,
  machineOf,
  parseBoot,
  resumeLine,
  selectCandidates,
  type TerminalView,
} from "./plan";

const record: ResumeRecord = {
  agent: "claude",
  session: "8ffa",
  cwd: "/Users/me/Code/my repo",
  program: "claude",
  args: ["--permission-mode", "auto"],
  started: 1_000,
};

const labels = (r: ResumeRecord, extra: Record<string, string> = {}): Record<string, string> => ({
  ...Object.fromEntries(
    recordLabels(r)
      .map((p) => p.split(/=(.*)/s, 2) as [string, string])
      .filter(([, v]) => v),
  ),
  ...extra,
});

const shell = { argv: ["/bin/zsh", "-l"], cwd: "/tmp", pid: 9 };
const term = (over: Partial<TerminalView>): TerminalView => ({
  address: "t1",
  state: "live",
  labels: labels(record),
  foreground: shell,
  ...over,
});

describe("resumeLine", () => {
  test("claude quotes the cwd and appends --resume", () => {
    expect(resumeLine(record)).toBe(
      "cd '/Users/me/Code/my repo' && claude --permission-mode auto --resume 8ffa",
    );
  });

  test("pi uses --session with the file path", () => {
    expect(
      resumeLine({
        ...record,
        agent: "pi",
        program: "pi",
        args: [],
        session: "/s/a b.jsonl",
        cwd: "/w",
      }),
    ).toBe("cd /w && pi --session '/s/a b.jsonl'");
  });

  test("escapes single quotes", () => {
    expect(resumeLine({ ...record, cwd: "/it's", args: [] })).toBe(
      "cd '/it'\\''s' && claude --resume 8ffa",
    );
  });
});

describe("selectCandidates", () => {
  const boots = new Map([[undefined, 5_000]]);
  const opts = { force: false };

  test("resumes a recovered shell whose session predates the boot", () => {
    const { resume } = selectCandidates([term({})], boots, opts);
    expect(resume.map((c) => c.address)).toEqual(["t1"]);
    expect(resume[0]!.boot).toBe(5_000);
  });

  test("skips a terminal still running its agent", () => {
    const { resume, skipped } = selectCandidates(
      [term({ foreground: { argv: ["claude"], cwd: "/", pid: 3 } })],
      boots,
      opts,
    );
    expect(resume).toEqual([]);
    expect(skipped[0]!.reason).toContain("still running");
  });

  test("skips sessions started after the boot", () => {
    const { resume } = selectCandidates(
      [term({ labels: labels({ ...record, started: 6_000 }) })],
      boots,
      opts,
    );
    expect(resume).toEqual([]);
  });

  test("never retries a boot it already attempted", () => {
    const attempted = term({ labels: labels(record, { "resume.attempt": "5000" }) });
    expect(selectCandidates([attempted], boots, opts).resume).toEqual([]);
    expect(selectCandidates([attempted], boots, { force: true }).resume).toHaveLength(1);
  });

  test("uses each machine's own boot time", () => {
    const remote = term({ address: "vps/t12" });
    const { resume, skipped } = selectCandidates(
      [remote],
      new Map([
        [undefined, 5_000],
        ["vps", 500],
      ]),
      opts,
    );
    expect(resume).toEqual([]);
    expect(skipped[0]!.reason).toContain("after the last boot");
  });

  test("ignores terminals without a record", () => {
    expect(selectCandidates([term({ labels: {} })], boots, opts)).toEqual({
      resume: [],
      skipped: [],
    });
  });
});

describe("helpers", () => {
  test("isBareShell", () => {
    expect(isBareShell(shell)).toBe(true);
    expect(isBareShell({ argv: ["-zsh"], cwd: "/", pid: 1 })).toBe(true);
    expect(isBareShell({ argv: ["bun", "run", "dev"], cwd: "/", pid: 1 })).toBe(false);
    expect(isBareShell(null)).toBe(false);
  });

  test("machineOf", () => {
    expect(machineOf("t1")).toBeUndefined();
    expect(machineOf("vps/t12")).toBe("vps");
  });

  test("parseBoot", () => {
    expect(parseBoot("{ sec = 1794000000, usec = 12 } Tue Nov 17")).toBe(1_794_000_000_000);
    expect(parseBoot("1794000000\n")).toBe(1_794_000_000_000);
    expect(parseBoot("nope")).toBeUndefined();
  });
});
