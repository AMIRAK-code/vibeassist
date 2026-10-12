#!/usr/bin/env sh
# Installs the VibeAssist git hooks in the current repository:
#   pre-commit   scans the lines you're committing for secrets
#   post-commit  saves a local checkpoint (refs/vibe/checkpoints/<time>) you can rewind to
# and adds a "vibe-rewind" helper. Run from the repository root:
#   sh path/to/vibeassist-engine/hooks/install.sh
set -e
ACTION_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR" .vibeassist
cp "$ACTION_DIR/scripts/scan-staged.mjs" "$ACTION_DIR/scripts/secret-patterns.json" .vibeassist/

cat > "$HOOKS_DIR/pre-commit" <<'HOOK'
#!/usr/bin/env sh
node .vibeassist/scan-staged.mjs
HOOK

cat > "$HOOKS_DIR/post-commit" <<'HOOK'
#!/usr/bin/env sh
# Local checkpoint after every commit; nothing is pushed
git update-ref "refs/vibe/checkpoints/$(date -u +%Y%m%d-%H%M%S)" HEAD
HOOK

cat > .vibeassist/vibe-rewind <<'HOOK'
#!/usr/bin/env sh
# vibe-rewind            list checkpoints and snapshot tags, newest first
# vibe-rewind <name>     start a new branch at that checkpoint; your current work is untouched
if [ -z "$1" ]; then
  git for-each-ref --sort=-refname --format='%(refname:short)  %(objectname:short)  %(contents:subject)' refs/vibe/checkpoints | head -20
  git tag --list 'vibe-snapshot-*' --sort=-creatordate | head -10
  exit 0
fi
REF="$1"
git rev-parse --verify --quiet "refs/vibe/checkpoints/$REF" >/dev/null && REF="refs/vibe/checkpoints/$REF"
git switch -c "rewind/$(echo "$1" | tr '/' '-')" "$REF"
echo "You're on a new branch at $1. Your previous branch is unchanged."
HOOK

chmod +x "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/post-commit" .vibeassist/vibe-rewind
grep -qxF '.vibeassist/' .gitignore 2>/dev/null || echo '.vibeassist/' >> .gitignore
echo "VibeAssist hooks installed. Rewind with: .vibeassist/vibe-rewind"
