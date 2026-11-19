# herdr-resume

Brings Claude Code and pi agent sessions back after a reboot in Herdr terminals kept with `hc keep`.

## Install

```sh
bun install
just check
just install
herdr-resume backfill     # label Claude agents that are already running
```

Add the Claude Code hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "~/.local/bin/herdr-resume hook claude" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "~/.local/bin/herdr-resume hook claude" }] }
    ]
  }
}
```

Add the mod to your layout so it runs when the window opens, e.g. a hidden block:

```json
{ "id": "herdr-resume", "size": { "px": 0 }, "hidden": true, "content": { "mod": "herdr-resume" } }
```

Pi agents that were already running are labelled the next time they start.

## Limits

- Only terminals with `keep` on are recovered by Herdr; others are gone after a reboot.
- Remote machines need `herdr-resume` and the hooks installed there too.
- The Herdr window has to open after login for the mod to run; `herdr-resume apply` also works from any terminal.
