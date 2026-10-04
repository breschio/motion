#!/usr/bin/env bash
# Scaffold a film folder from the template.
# usage: bash new-film.sh <dir>
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:?usage: new-film.sh <dir>}"
if [ -e "$DIR/film.js" ]; then echo "$DIR/film.js already exists; not overwriting" >&2; exit 1; fi
mkdir -p "$DIR/assets" "$DIR/audio" "$DIR/out"
cp "$SKILL/template/index.html" "$SKILL/template/lib.js" "$SKILL/template/film.js" "$DIR/"
cp "$SKILL/HOUSE_RULES.md" "$DIR/HOUSE_RULES.md"
cat > "$DIR/BRIEF.md" <<'EOF'
# Brief

- Audience:
- Duration / BPM:
- Aspects: 16:9, 9:16, 1:1
- Message (one sentence):
- Palette:
- Type:

## Story

## Shot list
| Scene | Beats | What moves | Spring | Cue |
|---|---|---|---|---|
EOF
printf 'out/\n' > "$DIR/.gitignore"
echo "film scaffolded at $DIR"
echo "preview: open $DIR/index.html (append ?aspect=9:16 or ?aspect=1:1)"
echo "skill:   $SKILL"
