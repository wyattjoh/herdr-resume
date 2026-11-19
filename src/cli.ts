#!/usr/bin/env bun
import { apply, backfill, type Report } from "./apply";
import { claudeHook, piHook, recordClaude } from "./hook";

const USAGE = `herdr-resume: resume agent sessions in kept Herdr terminals after a reboot

Usage:
  herdr-resume hook claude          Claude Code SessionStart/SessionEnd hook (JSON on stdin)
  herdr-resume hook pi              pi extension hook (JSON on stdin)
  herdr-resume plan [--force]       List what apply would resume
  herdr-resume apply [--force]      Type the resume command into each recovered terminal
  herdr-resume backfill [--dry-run] Label Claude agents started before the hooks existed

Options:
  --force        Ignore the boot-time and already-attempted checks
  --only <t>     Limit plan/apply to one terminal address
  --json         Machine-readable output`;

const flag = (args: string[], name: string): boolean => args.includes(name);
const option = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function printReport(report: Report, json: boolean, verb: string): void {
  if (json) {
    console.log(JSON.stringify(report));
    return;
  }
  for (const r of report.resumed) console.log(`${verb} ${r.address} (${r.agent}): ${r.line}`);
  for (const f of report.failed) console.log(`failed ${f.address}: ${f.error}`);
  for (const s of report.skipped) console.log(`skip ${s.address}: ${s.reason}`);
  if (!report.resumed.length && !report.failed.length && !report.skipped.length)
    console.log("No labelled terminals.");
}

async function main(args: string[]): Promise<number> {
  const [command, sub] = args;
  const json = flag(args, "--json");
  if (command === "hook") {
    const input = await new Response(Bun.stdin.stream()).text();
    // Hooks must never break the agent: report and exit 0.
    try {
      if (sub === "claude") await claudeHook(input);
      else if (sub === "pi") await piHook(input);
      else throw new Error(`unknown hook ${sub}`);
    } catch (error) {
      console.error(`herdr-resume hook ${sub}: ${error instanceof Error ? error.message : error}`);
    }
    return 0;
  }
  if (command === "record" && sub === "claude") {
    const [, , pid, session, cwd] = args;
    await recordClaude(Number(pid), session!, cwd!).catch((error) => console.error(error));
    return 0;
  }
  if (command === "plan" || command === "apply") {
    const report = await apply({
      force: flag(args, "--force"),
      dryRun: command === "plan",
      only: option(args, "--only"),
    });
    printReport(report, json, command === "plan" ? "would resume" : "resumed");
    return report.failed.length ? 1 : 0;
  }
  if (command === "backfill") {
    const dry = flag(args, "--dry-run");
    const result = await backfill(dry);
    if (json) console.log(JSON.stringify(result));
    else {
      for (const a of result.labelled) console.log(`${dry ? "would label" : "labelled"} ${a}`);
      for (const a of result.restartPi) console.log(`restart pi once in ${a} to label it`);
    }
    return 0;
  }
  console.log(USAGE);
  return command === undefined || command === "--help" || command === "-h" ? 0 : 2;
}

process.exit(await main(process.argv.slice(2)));
