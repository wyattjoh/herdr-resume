# herdr-resume

Resumes Claude Code and pi sessions in kept Herdr terminals after a reboot. Herdr's `keep` brings a terminal back as a bare login shell but never reruns its program; herdr-resume types the right `--resume` command back in.

## How it works

- Agents record themselves in terminal labels (`resume.*`, see `src/labels.ts`). Labels survive keep recovery.
  - Claude: `SessionStart`/`SessionEnd` hooks run `herdr-resume hook claude`. SessionStart hands off to a detached `herdr-resume record claude`, which waits until that Claude pid is the terminal's foreground (`hc get` has no foreground for the first moments, and the wait also keeps nested `claude` runs from replacing the outer record).
  - pi: `pi-extension/herdr-resume.ts` sends its own argv and session file to `herdr-resume hook pi`.
  - Deliberate exits clear the record (Claude `prompt_input_exit`/`logout`/`clear`; pi `quit` not caused by a signal), and only when the labelled session is the one ending.
- The `herdr-resume` mod runs `herdr-resume apply --json` at window start and every 30 s for 10 minutes. A terminal is resumed only when it is live, has a bare shell in front, its session started before that machine's last boot, and `resume.attempt` isn't already that boot. The attempt is labelled before typing, so it fires once per boot.
- `src/args.ts` keeps flags worth repeating and drops positionals (initial prompts), session selectors and secrets (`pi --api-key`). Update its tables when either CLI adds value-taking flags.

## Commands

- `just check`: lint (oxfmt, oxlint, knip), `bun test`, typecheck, and `herdr-app check` against an isolated app home under `.scratch/`. Never installs.
- `just build`: `dist/herdr-resume` (`bun build --compile`) and `dist/mod/`.
- `just install`: copies the binary to `~/.local/bin`, the mod to `~/.config/herdr-app/mods/herdr-resume` and the pi extension to `~/.pi/agent/extensions`. Live writes; ask first. Claude hooks and the layout block are added by hand (README).
- `herdr-resume plan [--force] [--only <t>]` shows what apply would do; `apply --force --only <t>` exercises a scratch terminal without a reboot.

## Testing safely

Never run `apply` without `--only` against the user's live core while testing: it types into real terminals. End-to-end tests use a scratch `hc run --keep` terminal (a compiled stand-in named `claude` passes the ancestry check), `kill -9` its program, then `apply --only <t> --force`. Clean up with `hc kill` and `hc rm`.
