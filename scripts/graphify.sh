#!/usr/bin/env sh
# Set up or refresh graphify for this repository.
#
# graphify turns the repository into a queryable knowledge graph and installs
# itself as a skill for Claude Code, GitHub Copilot CLI and Codex. The skill
# bodies, the assistant hooks and the generated graph are machine-local: this
# script writes them and .gitignore keeps them out of the history, so the only
# committed parts are this script and the graphify sections of the instruction
# files that tell an assistant the graph exists.
#
#   sh scripts/graphify.sh setup    install the CLI and the project skills
#   sh scripts/graphify.sh update   upgrade the CLI, refresh the skills and graph
#
# Override the target assistants with GRAPHIFY_PLATFORMS="claude codex".
# https://github.com/Graphify-Labs/graphify
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPO_ROOT"

PLATFORMS=${GRAPHIFY_PLATFORMS:-"claude copilot codex"}
MODE=${1:-setup}

die() {
    echo "graphify: $*" >&2
    exit 1
}

# The CLI ships on PyPI as `graphifyy`. uv is preferred because it keeps the
# tool in its own environment; pipx and a user-level pip install are accepted so
# the script still works on a machine that has neither.
ensure_cli() {
    if command -v uv >/dev/null 2>&1; then
        if [ "$1" = upgrade ] && uv tool list 2>/dev/null | grep -q '^graphifyy '; then
            uv tool upgrade graphifyy >/dev/null
        else
            uv tool install --quiet graphifyy
        fi
    elif command -v pipx >/dev/null 2>&1; then
        pipx upgrade graphifyy >/dev/null 2>&1 || pipx install graphifyy >/dev/null
    elif command -v python3 >/dev/null 2>&1; then
        python3 -m pip install --user --upgrade --quiet graphifyy
    else
        die "need uv, pipx, or python3 to install the graphifyy CLI"
    fi

    command -v graphify >/dev/null 2>&1 ||
        die "graphify is not on PATH after install; add the tool bin directory to PATH"
}

# `graphify install` records the absolute path of the binary on this machine, so
# the hooks it writes cannot be shared. Claude's move to settings.local.json,
# which Claude Code merges over settings.json, leaving any committed settings
# untouched; Codex has no local variant, so its file is rewritten in place and
# ignored. Both end up calling `graphify` through PATH.
localize_hooks() {
    command -v python3 >/dev/null 2>&1 || return 0
    python3 - <<'PY'
import json, pathlib

def portable(command):
    return "graphify" + command.split("graphify", 1)[1] if "graphify" in command else command

def is_graphify(entry):
    return any("graphify" in str(h.get("command", "")) for h in entry.get("hooks", []))

# Claude: split graphify's hooks out of the shared file into the local one.
shared_path = pathlib.Path(".claude/settings.json")
local_path = pathlib.Path(".claude/settings.local.json")
if shared_path.is_file():
    shared = json.loads(shared_path.read_text() or "{}")
    moved = {}
    for event, entries in list(shared.get("hooks", {}).items()):
        take = [e for e in entries if is_graphify(e)]
        keep = [e for e in entries if not is_graphify(e)]
        if not take:
            continue
        for entry in take:
            for hook in entry.get("hooks", []):
                hook["command"] = portable(str(hook.get("command", "")))
        moved[event] = take
        if keep:
            shared["hooks"][event] = keep
        else:
            del shared["hooks"][event]
    if moved:
        if not shared.get("hooks"):
            shared.pop("hooks", None)
        if shared:
            shared_path.write_text(json.dumps(shared, indent=2) + "\n")
        else:
            shared_path.unlink()
        merged = json.loads(local_path.read_text()) if local_path.is_file() else {}
        hooks = merged.setdefault("hooks", {})
        for event, entries in moved.items():
            hooks[event] = [e for e in hooks.get(event, []) if not is_graphify(e)] + entries
        local_path.write_text(json.dumps(merged, indent=2) + "\n")

# Codex: keep the file where it is, but stop it naming one machine's bin dir.
codex_path = pathlib.Path(".codex/hooks.json")
if codex_path.is_file():
    codex = json.loads(codex_path.read_text() or "{}")
    for entries in codex.get("hooks", {}).values():
        for entry in entries:
            for hook in entry.get("hooks", []):
                hook["command"] = portable(str(hook.get("command", "")))
    codex_path.write_text(json.dumps(codex, indent=2) + "\n")
PY
}

# Everything graphify generates is machine-local and regenerable from this
# script, so none of it belongs in the history.
ensure_gitignore() {
    [ -e .git ] || return 0
    for pattern in \
        '.claude/skills/graphify/' \
        '.claude/settings.local.json' \
        '.copilot/skills/graphify/' \
        '.codex/skills/graphify/' \
        '.codex/hooks.json' \
        'graphify-out/'; do
        grep -qxF "$pattern" .gitignore 2>/dev/null && continue
        if [ -s .gitignore ] && [ -n "$(tail -c1 .gitignore)" ]; then
            printf '\n' >>.gitignore
        fi
        printf '%s\n' "$pattern" >>.gitignore
    done
}

case "$MODE" in
setup) ensure_cli install ;;
update) ensure_cli upgrade ;;
*) die "unknown mode '$MODE' (expected setup or update)" ;;
esac

# Keep the exact bytes of a committed settings file so that pulling graphify's
# hooks back out leaves no reformatting behind for someone to review.
SETTINGS_BEFORE=
if [ -f .claude/settings.json ]; then
    SETTINGS_BEFORE=$(mktemp)
    cp .claude/settings.json "$SETTINGS_BEFORE"
fi

for platform in $PLATFORMS; do
    graphify install --project --platform "$platform" >/dev/null ||
        die "could not install the skill for $platform"
done

localize_hooks

# graphify writes a .graphify-bak beside any file it edits; the originals are
# either restored below or tracked by git, so the copies are noise.
find . -name '*.graphify-bak' -not -path './.git/*' -delete 2>/dev/null || true

if [ -n "$SETTINGS_BEFORE" ] && [ -f .claude/settings.json ] && command -v python3 >/dev/null 2>&1; then
    if python3 -c 'import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
sys.exit(0 if a==b else 1)' .claude/settings.json "$SETTINGS_BEFORE" 2>/dev/null; then
        cp "$SETTINGS_BEFORE" .claude/settings.json
    fi
fi
if [ -n "$SETTINGS_BEFORE" ]; then rm -f "$SETTINGS_BEFORE"; fi

ensure_gitignore

if [ "$MODE" = update ]; then
    # Only refresh a graph that exists: building the first one is a deliberate
    # `/graphify .` in the assistant, not something a routine update starts.
    if [ -f graphify-out/graph.json ]; then
        graphify update .
    else
        echo "graphify: no graph yet — run /graphify . in your assistant to build one"
    fi
fi

echo "graphify: $MODE complete for $PLATFORMS"
