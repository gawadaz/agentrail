#!/bin/sh
# AgentRail skill installer.
#   curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh -s -- --global
set -eu

REPO="gawadaz/agentrail"
VERSION="latest"
SCOPE="local"

while [ $# -gt 0 ]; do
  case "$1" in
    --global) SCOPE="global" ;;
    --local) SCOPE="local" ;;
    --version)
      if [ $# -lt 2 ]; then
        echo "install.sh: --version needs a value (e.g. --version v0.2.0)" >&2
        exit 2
      fi
      shift; VERSION="$1" ;;
    --version=*) VERSION="${1#--version=}" ;;
    -h|--help)
      echo "Usage: install.sh [--global] [--version vX.Y.Z]"
      exit 0 ;;
    *) echo "install.sh: unknown option '$1'" >&2; exit 2 ;;
  esac
  shift
done

if [ -n "${AGENTRAIL_SKILL_DIR:-}" ]; then
  TARGET="$AGENTRAIL_SKILL_DIR"
elif [ "$SCOPE" = "global" ]; then
  TARGET="$HOME/.claude/skills/agentrail"
else
  TARGET="$(pwd)/.claude/skills/agentrail"
fi

# Node check - warn, do not abort.
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "${NODE_MAJOR:-0}" -lt 18 ] 2>/dev/null; then
    echo "warning: Node $(node -v 2>/dev/null) detected; AgentRail needs Node >= 18 to run." >&2
  fi
else
  echo "warning: Node.js not found on PATH; AgentRail needs Node >= 18 to run." >&2
fi

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/$REPO/releases/latest/download/agentrail-skill.tar.gz"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/agentrail-skill.tar.gz"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading AgentRail skill ($VERSION)..."
if ! curl -fsSL "$URL" -o "$TMP/skill.tar.gz"; then
  echo "error: failed to download $URL" >&2
  echo "       check the version exists at https://github.com/$REPO/releases" >&2
  exit 1
fi

rm -rf "$TARGET"
mkdir -p "$TARGET"
tar -xzf "$TMP/skill.tar.gz" -C "$TARGET"

echo "Installed AgentRail skill to $TARGET"
echo
echo "There is no \"agentrail\" command on your PATH - the skill is self-contained."
echo "Run the CLI with: node \"$TARGET/cli.js\" <command>"
echo
echo "Next steps:"
echo "  1. Scaffold .agentrail/ in this project (prompts you to pick providers,"
echo "     so run it yourself in a terminal rather than asking Claude to):"
echo "       node \"$TARGET/cli.js\" init"
echo "  2. Reload Claude Code so it picks up the new skill."
echo "  3. Ask Claude: \"set up an AgentRail workflow\" or \"run my feature workflow\"."
echo
echo "Uninstall: rm -rf \"$TARGET\""
