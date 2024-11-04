#!/bin/bash
set -e -x

git pull --rebase

sed '1,/# / d' gitbook/README.md > README.md
git add README.md

internal/update-package-json.js
