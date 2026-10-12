#!/usr/bin/env bash
set -euo pipefail

# Wrapper to execute the Python asset builder
python3 "$(dirname "$0")/build-assets.py"
