default:
    @just --list

# Compile the CLI and bundle the mod into dist/ (never installs)
build:
    bun build --compile src/cli.ts --outfile dist/herdr-resume
    bun build mod/index.ts --outfile dist/mod/main.js --format esm --target browser --external gpui-kit --external gpui-base --external herdr
    cp mod/mod.json dist/mod/mod.json

# Check formatting, lint and unused code
lint:
    bun run format:check
    bun run lint
    bun run knip

# Format source and config
fmt:
    bun run format

typecheck:
    bun run typecheck

test:
    bun run test

# Load the bundled mod in an isolated Herdr app home
check-mod: build
    #!/usr/bin/env bash
    set -euo pipefail
    stage="$(mktemp -d "$PWD/.scratch/check-XXXXXX")"
    mkdir -p "$stage/mods/herdr-resume"
    cp dist/mod/* "$stage/mods/herdr-resume/"
    HERDR_APP_HOME="$stage" herdr-app check "$stage/mods/herdr-resume"

# Every gate; never installs
check: lint test typecheck check-mod

# Install the CLI, mod and pi extension (Claude hooks are added separately; see README)
install: build
    install -m 755 dist/herdr-resume ~/.local/bin/herdr-resume
    mkdir -p ~/.config/herdr-app/mods/herdr-resume
    cp dist/mod/main.js dist/mod/mod.json ~/.config/herdr-app/mods/herdr-resume/
    cp pi-extension/herdr-resume.ts ~/.pi/agent/extensions/herdr-resume.ts
