/**
 * Agent programs herdr-resume knows how to resume.
 */
export type Agent = "claude" | "pi";

type Arity = "value" | "variadic" | "optional";

type FlagTable = {
  arity: Record<string, Arity>;
  drop: Set<string>;
  oneShot: Set<string>;
};

// Claude Code: flags whose values must be skipped while looking for positionals.
const CLAUDE: FlagTable = {
  arity: {
    "--agent": "value",
    "--agents": "value",
    "--append-system-prompt": "value",
    "--append-system-prompt-file": "value",
    "--autocompact": "value",
    "--debug-file": "value",
    "--effort": "value",
    "--environment": "value",
    "--fallback-model": "value",
    "--input-format": "value",
    "--json-schema": "value",
    "--max-budget-usd": "value",
    "--model": "value",
    "--name": "value",
    "-n": "value",
    "--output-format": "value",
    "--permission-mode": "value",
    "--permission-prompts": "value",
    "--plugin-dir": "value",
    "--plugin-url": "value",
    "--remote-control-session-name-prefix": "value",
    "--session-id": "value",
    "--setting-sources": "value",
    "--settings": "value",
    "--system-prompt": "value",
    "--system-prompt-file": "value",
    "--system-prompt-snapshot": "value",
    "--add-dir": "variadic",
    "--allowedTools": "variadic",
    "--allowed-tools": "variadic",
    "--betas": "variadic",
    "--disallowedTools": "variadic",
    "--disallowed-tools": "variadic",
    "--file": "variadic",
    "--mcp-config": "variadic",
    "--tools": "variadic",
    "--cloud": "optional",
    "--debug": "optional",
    "-d": "optional",
    "--from-pr": "optional",
    "--prompt-suggestions": "optional",
    "--remote-control": "optional",
    "--resume": "optional",
    "-r": "optional",
    "--teleport": "optional",
    "--worktree": "optional",
    "-w": "optional",
  },
  // Session selectors and one-time actions that must not repeat on resume.
  drop: new Set([
    "--resume",
    "-r",
    "--continue",
    "-c",
    "--session-id",
    "--fork-session",
    "--from-pr",
    "--teleport",
    "--cloud",
    "--environment",
    "--worktree",
    "-w",
    "--tmux",
    "--bg",
    "--background",
    "--desktop",
    "--file",
    "--name",
    "-n",
  ]),
  oneShot: new Set(["--print", "-p", "--help", "-h", "--version", "-v"]),
};

const PI: FlagTable = {
  arity: {
    "--provider": "value",
    "--model": "value",
    "--api-key": "value",
    "--system-prompt": "value",
    "--append-system-prompt": "value",
    "--mode": "value",
    "--session": "value",
    "--session-id": "value",
    "--fork": "value",
    "--session-dir": "value",
    "--name": "value",
    "-n": "value",
    "--models": "value",
    "--tools": "value",
    "-t": "value",
    "--exclude-tools": "value",
    "-xt": "value",
    "--thinking": "value",
    "--extension": "value",
    "-e": "value",
    "--skill": "value",
    "--prompt-template": "value",
    "--theme": "value",
    "--use-theme": "value",
    "--tui-mode": "value",
    "--export": "value",
    "--list-models": "optional",
  },
  // --api-key is dropped so a secret never lands in a terminal label.
  drop: new Set([
    "--continue",
    "-c",
    "--resume",
    "-r",
    "--session",
    "--session-id",
    "--fork",
    "--name",
    "-n",
    "--api-key",
  ]),
  oneShot: new Set([
    "--print",
    "-p",
    "--export",
    "--list-models",
    "--no-session",
    "--help",
    "-h",
    "--version",
    "-v",
  ]),
};

const TABLES: Record<Agent, FlagTable> = { claude: CLAUDE, pi: PI };

/**
 * An agent command line reduced to what a resume should repeat.
 */
export type ParsedArgv = {
  /**
   * The program as it was invoked (argv[0]).
   */
  program: string;
  /**
   * Flags (with their values) to pass again on resume.
   */
  flags: string[];
  /**
   * False when the command was a one-shot run (print mode, help, export) that has nothing to resume.
   */
  interactive: boolean;
};

const isFlag = (token: string): boolean => token.length > 1 && token.startsWith("-");

/**
 * Splits an agent's argv into the flags worth repeating on resume.
 *
 * Positional arguments (initial prompts) and session selectors are dropped, so a resume
 * never re-sends the first prompt or opens a different session.
 *
 * @param agent - Which agent's flag table to use.
 * @param argv - The full argv, including the program at index 0.
 * @returns The program, the flags to keep, and whether the run was interactive.
 */
export function parseArgv(agent: Agent, argv: readonly string[]): ParsedArgv {
  const table = TABLES[agent];
  const flags: string[] = [];
  let interactive = true;
  let i = 1;
  while (i < argv.length) {
    const token = argv[i]!;
    i += 1;
    if (token === "--") break;
    if (!isFlag(token)) continue;

    const eq = token.startsWith("--") ? token.indexOf("=") : -1;
    const name = eq > 0 ? token.slice(0, eq) : token;
    const values: string[] = [];
    if (eq < 0) {
      const arity = table.arity[name];
      if (arity === "value" && i < argv.length) values.push(argv[i++]!);
      if (arity === "optional" && i < argv.length && !isFlag(argv[i]!)) values.push(argv[i++]!);
      if (arity === "variadic")
        while (i < argv.length && !isFlag(argv[i]!)) values.push(argv[i++]!);
    }
    const value = eq > 0 ? token.slice(eq + 1) : values[0];

    if (table.oneShot.has(name)) interactive = false;
    if (agent === "pi" && name === "--mode" && value !== "text") interactive = false;
    if (table.drop.has(name)) continue;
    flags.push(token, ...values);
  }
  return { program: argv[0] ?? agent, flags, interactive };
}
