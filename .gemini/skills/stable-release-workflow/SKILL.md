---
name: stable-release-workflow
description: Performs a coordinated stable release across the cf-workers-telegram-bot monorepo and its submodules. Use when the user specifically asks for a "stable release" or to publish changes after completing feature implementation or bug fixes.
---

# Stable Release Workflow

Follow this procedure to release a stable version of the `@codebam/cf-workers-telegram-bot` library and its associated submodules (`webapp`, `ai-workflow`, `consumer`).

## Prerequisites

Before starting the release process, ensure you have the necessary authentication tokens.

1.  **NPM Token**: The release process requires an `NPM_TOKEN` with publish permissions. You can find this in `~/Documents/env.fish` or by asking the user.
    ```bash
    # To export the token for the session:
    export NPM_TOKEN=$(grep "NPM_TOKEN" ~/Documents/env.fish | awk '{print $4}')
    ```

## Phase 1: Library Release (Root)

1.  **Validation**: Ensure all tests and linting pass in the root directory.
    ```bash
    npm run lint && npm test
    ```
2.  **Commit**: Commit all unstaged changes in the root repository.
    ```bash
    git add . && git commit -m "feat: <description of changes>"
    ```
3.  **Versioning**: Bump the version (typically patch) and synchronize `package-lock.json`.
    ```bash
    npm version patch
    npm install
    git add package-lock.json
    git commit --amend --no-edit
    ```
4.  **Tag & Push**: Force-tag the latest version (to ensure it matches `npm version` output) and push to master.
    ```bash
    # Get latest version from package.json
    VERSION="v$(node -p "require('./package.json').version")"
    git tag -f $VERSION
    git push origin master --tags --force
    ```

## Phase 2: Submodule Synchronization

Wait at least **1 minute** after Phase 1 to allow the main library's GitHub Actions/NPM registry to update.

1.  **Process Each Submodule**: Run the following in `ai-workflow`, `webapp`, and `consumer`.
    ```bash
    cd <submodule_dir>
    # Ensure all submodule changes are committed
    git add . && git commit -m "chore: update dependencies and bot logic" || true
    # Bump version and push
    npm version patch
    git push origin <branch_name> --tags
    cd ..
    ```
    *Note: `webapp` and `ai-workflow` use `main`; `consumer` and the root repo use `master`.*

2.  **Update Root Pointers**: Update the main repository to point to the new submodule tags.
    ```bash
    git add .
    git commit -m "chore: update submodules to latest stable versions"
    git push origin master
    ```

## CI/CD Expectations

- GitHub Actions are configured to publish to NPM and GitHub Packages whenever a new tag is pushed.
- The root library release must happen first, as submodules may depend on the latest published version of `@codebam/cf-workers-telegram-bot`.
