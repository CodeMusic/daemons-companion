#!/usr/bin/env bash
# Publish wiki/*.md to the repository's GitHub wiki (C-108).
#
#   ./wiki/publish.sh
#
# The pages are kept in wiki/ so they are versioned with the code; GitHub's wiki is its own git repository,
# daemons-companion.wiki.git. This clones it into a temporary folder, copies every wiki/*.md over it (not this
# script), commits "Wiki: from wiki/ at <the main repository's short sha>" and pushes. A page deleted here is not
# deleted from the wiki: remove it there by hand.
#
# GitHub makes the wiki's repository only once a first page has been saved in the browser, so the very first time:
# the repository's Wiki tab > Create the first page > Save. Then run this.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WIKI_URL="https://github.com/CodeMusic/daemons-companion.wiki.git"

sha="$(git -C "$ROOT" rev-parse --short HEAD)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if ! git clone --quiet "$WIKI_URL" "$tmp/wiki" 2>/dev/null; then
  echo "publish: could not clone $WIKI_URL." >&2
  echo "         The wiki must first get a page saved in the browser: the repository's Wiki tab > Create the first page > Save." >&2
  echo "         Then run this again." >&2
  exit 1
fi

shopt -s nullglob
pages=("$HERE"/*.md)
[[ ${#pages[@]} -gt 0 ]] || { echo "publish: no pages in $HERE" >&2; exit 1; }
cp "${pages[@]}" "$tmp/wiki/"

cd "$tmp/wiki"
git add -A
if git diff --cached --quiet; then
  echo "publish: the wiki already matches wiki/ at $sha -- nothing to push."
  exit 0
fi
git commit --quiet -m "Wiki: from wiki/ at $sha"
git push --quiet
echo "publish: pushed ${#pages[@]} pages to the wiki (from $sha)."
