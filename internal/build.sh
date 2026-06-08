#!/bin/bash
set -e

cat gitbook/README.md | sed 's/\.gitbook/gitbook\/.gitbook/' > README.md
internal/fix-svg-fonts.js
internal/docs.sh
internal/llms.sh

cat tsconfig.json | sed 's/"references"/"references-off"/'> tsconfig.json.tmp
trap 'rm -f tsconfig.json.tmp' EXIT
tsgo -p tsconfig.json.tmp
