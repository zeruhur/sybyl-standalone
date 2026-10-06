#!/usr/bin/env bash
# Prints the body of one version's section from CHANGELOG.md: the lines after its `## vX.Y.Z`
# heading, up to the next `## ` heading. The release workflow uses it as the release description.
#
# Usage: changelog-section.sh <tag, e.g. v0.17.0> [changelog path]
# Exits 1 (with nothing printed) if the changelog has no section for that version, or it's empty.
set -euo pipefail

tag="$1"
changelog="${2:-CHANGELOG.md}"

section="$(awk -v tag="$tag" '
  { sub(/\r$/, "") }
  # The heading is "## vX.Y.Z", optionally followed by " - date" or other text.
  /^## / {
    if (found) exit
    if ($2 == tag) { found = 1; next }
  }
  found { print }
' "$changelog")"

# Trim leading and trailing blank lines.
section="$(printf '%s\n' "$section" | sed -e '/./,$!d' | sed -e ':a' -e '/^\n*$/{$d;N;ba' -e '}')"

if [ -z "$section" ]; then
  echo "CHANGELOG.md has no section for $tag (expected a '## $tag' heading)." >&2
  exit 1
fi
printf '%s\n' "$section"
