import { describe, expect, test } from "bun:test";
import { parseArgv } from "./args";

describe("parseArgv claude", () => {
  test("keeps flags, drops the resume selector", () => {
    const parsed = parseArgv("claude", [
      "/u/.local/bin/claude",
      "--resume",
      "8ffa",
      "--permission-mode",
      "auto",
      "--allowed-tools",
      "a",
      "--allowed-tools",
      "b",
    ]);
    expect(parsed).toEqual({
      program: "/u/.local/bin/claude",
      flags: ["--permission-mode", "auto", "--allowed-tools", "a", "--allowed-tools", "b"],
      interactive: true,
    });
  });

  test("drops an initial prompt and --continue", () => {
    expect(parseArgv("claude", ["claude", "-c", "--model", "opus", "fix the bug"]).flags).toEqual([
      "--model",
      "opus",
    ]);
  });

  test("an optional --resume value is not mistaken for a flag", () => {
    expect(parseArgv("claude", ["claude", "-r", "--verbose"]).flags).toEqual(["--verbose"]);
  });

  test("keeps --flag=value forms", () => {
    expect(parseArgv("claude", ["claude", "--model=opus", "--name=x"]).flags).toEqual([
      "--model=opus",
    ]);
  });

  test("print mode is not interactive", () => {
    expect(parseArgv("claude", ["claude", "-p", "hi"]).interactive).toBe(false);
  });

  test("stops at --", () => {
    expect(parseArgv("claude", ["claude", "--verbose", "--", "--model", "x"]).flags).toEqual([
      "--verbose",
    ]);
  });
});

describe("parseArgv pi", () => {
  test("drops secrets and session selectors", () => {
    const parsed = parseArgv("pi", [
      "pi",
      "--api-key",
      "sk-1",
      "--session",
      "a.jsonl",
      "--thinking",
      "high",
      "hello",
    ]);
    expect(parsed.flags).toEqual(["--thinking", "high"]);
    expect(parsed.interactive).toBe(true);
  });

  test("rpc and json modes are not interactive", () => {
    expect(parseArgv("pi", ["pi", "--mode", "rpc"]).interactive).toBe(false);
    expect(parseArgv("pi", ["pi", "--mode", "text"]).interactive).toBe(true);
    expect(parseArgv("pi", ["pi", "--no-session"]).interactive).toBe(false);
  });
});
