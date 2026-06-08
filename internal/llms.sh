#!/bin/bash
# Fetches the GitBook-generated llms-full.txt and stores it in docs/llms-full.md
# so it ships alongside the typedoc output.
set -euo pipefail

SOURCE_URL="https://docs.ent-framework.net/llms-full.txt"
OUTPUT_FILE="docs/llms-full.md"
TEMP_FILE="$OUTPUT_FILE.tmp"

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Fetching $SOURCE_URL ..."
curl -fsSL "$SOURCE_URL" -o "$TEMP_FILE"

if [ ! -s "$TEMP_FILE" ]; then
  rm -f "$TEMP_FILE"
  echo "ERROR: Fetched content is empty. Aborting." >&2
  exit 1
fi

mv "$TEMP_FILE" "$OUTPUT_FILE"
echo "Written to $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE" | tr -d ' ') lines)"
