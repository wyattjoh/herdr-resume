/**
 * Result of running a program.
 */
export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * Runs a program and collects its output.
 *
 * @param argv - Program and arguments.
 * @param input - Text for stdin, or undefined for none.
 * @returns Exit code and output.
 */
export async function run(
  argv: string[],
  input: string | undefined = undefined,
): Promise<RunResult> {
  const proc = Bun.spawn(argv, {
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

/**
 * Runs `hc` with the given arguments.
 *
 * @param args - Arguments after `hc`.
 * @returns Exit code and output.
 */
export function hc(args: string[]): Promise<RunResult> {
  return run([process.env.HC_BIN ?? "hc", ...args]);
}

/**
 * Runs `hc <args> --json` and parses its output.
 *
 * @param args - Arguments after `hc`.
 * @returns The parsed JSON.
 * @throws When hc fails or prints invalid JSON.
 */
export async function hcJson<T>(args: string[]): Promise<T> {
  const result = await hc([...args, "--json"]);
  if (result.code !== 0)
    throw new Error(`hc ${args.join(" ")}: ${(result.stderr || result.stdout).trim()}`);
  return JSON.parse(result.stdout) as T;
}

/**
 * Sets labels on a terminal.
 *
 * @param address - Terminal address.
 * @param pairs - key=value pairs (key= removes).
 * @throws When hc fails.
 */
export async function label(address: string, pairs: string[]): Promise<void> {
  const result = await hc(["label", address, ...pairs]);
  if (result.code !== 0)
    throw new Error(`hc label ${address}: ${(result.stderr || result.stdout).trim()}`);
}
