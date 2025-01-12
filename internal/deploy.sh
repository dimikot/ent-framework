#!/bin/bash
set -e -x

git pull --rebase

cat gitbook/README.md | sed '1,/# / d' | sed 's/\.gitbook/gitbook\/.gitbook/' > README.md
git add README.md

internal/update-package-json.js
internal/fix-svg-fonts.js
