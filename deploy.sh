#!/usr/bin/env bash
# Качва собствения сайт (dist/site) в клона gh-pages на GitHub. Пускай след `node build.mjs`.
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d)
cp -r dist/site/. "$TMP/"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="Мегдан" -c user.email="megdan@users.noreply.github.com" commit -qm "Сайт $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
rm -rf "$TMP"
echo "Качено в gh-pages."
