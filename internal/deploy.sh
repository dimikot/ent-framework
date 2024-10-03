#!/bin/bash
set -e -x

git pull --rebase

cp -af gitbook/README.md .
git add README.md

internal/update-package-json.js
