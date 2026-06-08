#!/bin/bash
set -e

rm -rf docs
typedoc --plugin typedoc-plugin-markdown --plugin typedoc-plugin-merge-modules
