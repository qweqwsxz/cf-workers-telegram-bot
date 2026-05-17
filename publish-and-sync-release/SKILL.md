---
name: publish-and-sync-release
description: Coordinated release workflow that bumps the root library version, pushes a tag to trigger GitHub CI publishing, and updates all submodules to consume the new library version.
---

# Publish and Sync Release Workflow

Use this skill when you need to release changes to the `@codebam/cf-workers-telegram-bot` library, trigger GitHub CI to publish the new package, and update the submodules (`webapp`, `ai-workflow`, `consumer`) to use the new version.

## Key Prerequisites
- An active `NPM_TOKEN` with access to read/write packages on GitHub Packages.
- The `.npmrc` file configured to point `@codebam` to GitHub Packages:
  ```
  @codebam:registry=https://npm.pkg.github.com/
  //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
  ```

## Workflows

### Phase 1: Bump & Publish Root Library
1. Stage and commit the library changes in the root repository:
   ```bash
   git add src/
   git commit -m "fix/feat: <description>"
   ```
2. Bump the version of the root package using `--no-git-tag-version` (to avoid git cleanliness blocks):
   ```bash
   npm version patch --no-git-tag-version
   ```
3. Stage and commit the version bump and `.gitignore` updates:
   ```bash
   git add package.json package-lock.json .gitignore
   git commit -m "chore: bump version to <new_version>"
   ```
4. Create the git release tag and force-push to master:
   ```bash
   git tag -f -a v<new_version> -m "v<new_version>"
   git push origin master --tags --force
   ```
5. Wait **2-3 minutes** for GitHub CI to build, test, and publish the new package version to GitHub Packages.

### Phase 2: Synchronize Submodules
For each submodule (`webapp`, `ai-workflow`, `consumer`):
1. Copy the `.npmrc` containing the `NPM_TOKEN` to the submodule:
   ```bash
   cp .npmrc <submodule_dir>/.npmrc
   ```
2. Make sure `.npmrc` is ignored:
   ```bash
   echo ".npmrc" >> <submodule_dir>/.gitignore
   ```
3. Update `@codebam/cf-workers-telegram-bot` version in `<submodule_dir>/package.json` to the `<new_version>`.
4. Install the new package version inside the submodule:
   ```bash
   cd <submodule_dir>
   npm install
   ```
5. Stage, commit, and push the submodule updates:
   ```bash
   git add package.json package-lock.json .gitignore
   git commit -m "chore: bump cf-workers-telegram-bot to <new_version>"
   git push origin <branch_name> --tags
   cd ..
   ```
   *Note: `webapp` and `ai-workflow` use `main`; `consumer` uses `master`.*

### Phase 3: Update Monorepo Pointers
Update the main monorepo to point to the new submodule commits:
1. Stage, commit, and push:
   ```bash
   git add webapp ai-workflow consumer
   git commit -m "chore: update submodules to latest commits"
   git push origin master
   ```
