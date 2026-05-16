#!/usr/bin/env bash

# Set the custom hooks directory
git config --local core.hooksPath .githooks/

# Ensure all hooks are executable
chmod +x .githooks/*

echo "✅ Git hooks have been set up from .githooks/"
