#!/usr/bin/env bash

# Get the current branch name
branch_name=$(git rev-parse --abbrev-ref HEAD)

# Skip branch linting for main, master, or develop branches
if [ "$branch_name" = "main" ] || [ "$branch_name" = "master" ] || [ "$branch_name" = "develop" ]; then
  exit 0
fi

# Regex for: type/short-description-TASKID (e.g., feat/implement-stripe-webhooks-VL-42)
valid_branch_regex="^(feat|fix|docs|style|refactor|test|chore|ci|build|perf|revert)\/[a-z0-9\-]+(-[A-Z]+-[0-9]+)?$"

if [[ ! $branch_name =~ $valid_branch_regex ]]; then
  echo "🛑 ERROR: Invalid branch name '$branch_name'."
  echo "Branch names must match the format: type/short-description-TASKID"
  echo "Types allowed: feat, fix, docs, refactor, etc."
  echo "Example: feat/implement-stripe-webhooks-VL-42"
  exit 1
fi
