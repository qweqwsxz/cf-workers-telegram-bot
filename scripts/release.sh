#!/usr/bin/env bash
#
# release.sh — cut and push a production release for the bot and/or webapp.
#
# Production deploys are triggered by tags on the superproject
# (.github/workflows/deploy.yml):
#
#   bot-v*     -> check + deploy_bot_prod
#   webapp-v*  -> check + deploy_webapp_prod
#
# Pushing the branch only deploys the bot to the dev environment.
#
# The script fetches tags first (the remote is authoritative for release
# numbering), refuses to run on dirty worktrees or stale branches, runs the
# same checks as the deploy workflow, creates the next patch tag per component
# (GPG-signed by default) and pushes submodule branches before the
# superproject and tags, because the workflow checks submodules out at the
# tagged commit.
#
# Usage: ./scripts/release.sh [bot|webapp|both] [options]
#
# Options:
#   -m, --message TEXT   tag message (default: "<tag>: <HEAD subject>")
#   -n, --no-sign        create annotated tags instead of GPG-signed tags
#   -s, --skip-checks    skip typecheck/lint/test/build
#       --no-fetch       skip `git fetch` (offline; numbering may be stale)
#   -d, --dry-run        print the plan and the commands without running them
#   -y, --yes            skip the confirmation prompt
#       --no-push        create tags locally and print the push commands
#   -h, --help           show this help

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET="both"
MESSAGE=""
SIGN=1
RUN_CHECKS=1
DO_FETCH=1
DRY_RUN=0
ASSUME_YES=0
DO_PUSH=1

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die() { printf 'error: %s\n' "$1" >&2; exit 1; }
run() {
	if [ "$DRY_RUN" = 1 ]; then
		printf '+ %s\n' "$*"
	else
		"$@"
	fi
}

usage() {
	cat <<'EOF'
Usage: ./scripts/release.sh [bot|webapp|both] [options]

Creates the next patch tag for each component and pushes it. A `bot-v*` tag
deploys the bot to production, a `webapp-v*` tag deploys the webapp.

Options:
  -m, --message TEXT   tag message (default: "<tag>: <HEAD subject>")
  -n, --no-sign        create annotated tags instead of GPG-signed tags
  -s, --skip-checks    skip typecheck/lint/test/build
      --no-fetch       skip `git fetch` (offline; numbering may be stale)
  -d, --dry-run        print the plan and the commands without running them
  -y, --yes            skip the confirmation prompt
      --no-push        create tags locally and print the push commands
  -h, --help           show this help

Examples:
  ./scripts/release.sh both
  ./scripts/release.sh bot -m "fix granite tool calls"
  ./scripts/release.sh both -d
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
		bot | webapp | both) TARGET="$1" ;;
		-m | --message)
			[ $# -ge 2 ] || die "missing value for $1"
			MESSAGE="$2"
			shift
			;;
		-n | --no-sign) SIGN=0 ;;
		-s | --skip-checks) RUN_CHECKS=0 ;;
		--no-fetch) DO_FETCH=0 ;;
		-d | --dry-run) DRY_RUN=1 ;;
		-y | --yes) ASSUME_YES=1 ;;
		--no-push) DO_PUSH=0 ;;
		-h | --help)
			usage
			exit 0
			;;
		*) die "unknown argument: $1 (try --help)" ;;
	esac
	shift
done

assert_clean() {
	local name="$1" dir="$2" dirty
	dirty="$(git -C "$dir" status --porcelain --untracked-files=no)"
	[ -z "$dirty" ] || die "$name has uncommitted changes — commit or stash them first"
}

branch_of() {
	local dir="$1" label="$2" branch
	branch="$(git -C "$dir" symbolic-ref --quiet --short HEAD || true)"
	[ -n "$branch" ] || die "$label is in detached HEAD — check out a branch first"
	printf '%s' "$branch"
}

assert_not_behind() {
	local label="$1" dir="$2" branch="$3" upstream="origin/$3" behind
	if ! git -C "$dir" rev-parse --quiet --verify "refs/remotes/$upstream" >/dev/null; then
		printf 'warning: %s has no %s ref, skipping up-to-date check\n' "$label" "$upstream" >&2
		return 0
	fi
	behind="$(git -C "$dir" rev-list --count "HEAD..$upstream")"
	[ "$behind" = 0 ] || die "$label is $behind commit(s) behind $upstream — pull before releasing"
}

# Latest "X.Y.Z" released for a tag prefix such as "bot-v", or empty.
latest_version() {
	local prefix="$1" tag
	for tag in $(git tag -l "${prefix}[0-9]*"); do
		if [[ "$tag" =~ ^${prefix}([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
			printf '%s.%s.%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
		fi
	done | sort -t. -k1,1n -k2,2n -k3,3n | tail -n1
}

bump_patch() {
	local major minor patch
	IFS=. read -r major minor patch <<<"$1"
	printf '%s.%s.%s' "$major" "$minor" "$((patch + 1))"
}

bold "Checking worktrees"
assert_clean "superproject" "."
assert_clean "bot" "bot"
assert_clean "webapp" "webapp"
if ! git var GIT_COMMITTER_IDENT >/dev/null 2>&1; then
	die "git has no committer identity — set user.name and user.email first"
fi

ROOT_BRANCH="$(branch_of "." "superproject")"
BOT_BRANCH="$(branch_of "bot" "bot")"
WEBAPP_BRANCH="$(branch_of "webapp" "webapp")"

if [ "$DO_FETCH" = 1 ]; then
	bold "Fetching tags and branches"
	run git fetch --tags --force origin
	run git -C bot fetch origin "$BOT_BRANCH"
	run git -C webapp fetch origin "$WEBAPP_BRANCH"
fi

assert_not_behind "superproject" "." "$ROOT_BRANCH"
assert_not_behind "bot" "bot" "$BOT_BRANCH"
assert_not_behind "webapp" "webapp" "$WEBAPP_BRANCH"

HEAD_SUBJECT="$(git log -1 --pretty=%s)"
HEAD_SHORT="$(git rev-parse --short HEAD)"
TAGS=()
BOT_TAG=""
WEBAPP_TAG=""

if [ "$TARGET" = "bot" ] || [ "$TARGET" = "both" ]; then
	latest="$(latest_version 'bot-v')"
	[ -n "$latest" ] || die "no bot-v* tags found"
	BOT_TAG="bot-v$(bump_patch "$latest")"
	TAGS+=("$BOT_TAG")
fi
if [ "$TARGET" = "webapp" ] || [ "$TARGET" = "both" ]; then
	latest="$(latest_version 'webapp-v')"
	[ -n "$latest" ] || die "no webapp-v* tags found"
	WEBAPP_TAG="webapp-v$(bump_patch "$latest")"
	TAGS+=("$WEBAPP_TAG")
fi

message_for() {
	if [ -n "$MESSAGE" ]; then
		printf '%s' "$MESSAGE"
	else
		printf '%s: %s' "$1" "$HEAD_SUBJECT"
	fi
}

TRIGGERS=()
for tag in "${TAGS[@]}"; do
	case "$tag" in
		bot-v*) TRIGGERS+=("bot prod deploy") ;;
		webapp-v*) TRIGGERS+=("webapp prod deploy") ;;
	esac
done

push_plan() {
	if [ "$TARGET" = "bot" ] || [ "$TARGET" = "both" ]; then
		printf 'git -C bot push origin %s\n' "$BOT_BRANCH"
	fi
	if [ "$TARGET" = "webapp" ] || [ "$TARGET" = "both" ]; then
		printf 'git -C webapp push origin %s\n' "$WEBAPP_BRANCH"
	fi
	printf 'git push origin %s\n' "$ROOT_BRANCH"
	printf 'git push origin %s\n' "${TAGS[*]}"
}

bold "Release plan"
printf '  commit:  %s %s\n' "$HEAD_SHORT" "$HEAD_SUBJECT"
printf '  branch:  %s (pushed before the tags)\n' "$ROOT_BRANCH"
printf '  checks:  %s\n' "$([ "$RUN_CHECKS" = 1 ] && echo "typecheck, lint, test, build" || echo "skipped")"
printf '  tags:    %s (%s)\n' "${TAGS[*]}" "$([ "$SIGN" = 1 ] && echo "signed" || echo "annotated")"
printf '  trigger: %s\n' "${TRIGGERS[*]}"

if [ "$DRY_RUN" = 1 ]; then
	bold "Dry run — no changes made. Commands that would run:"
	push_plan
	exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
	printf '\nProceed? [y/N] '
	read -r reply || reply=""
	case "$reply" in
		y | Y | yes | YES) ;;
		*) die "aborted" ;;
	esac
fi

if [ "$RUN_CHECKS" = 1 ]; then
	bold "Running the same checks as the deploy workflow"
	run npm run typecheck
	run npm run lint --workspace webapp
	run npm run test --workspace webapp
	run npm run build
fi

bold "Creating tags"
for tag in "${TAGS[@]}"; do
	if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
		die "tag $tag already exists — fetch first or delete the stale tag"
	fi
	if [ "$SIGN" = 1 ]; then
		run git tag -s "$tag" -m "$(message_for "$tag")" ||
			die "failed to create signed tag $tag — configure a GPG key or use --no-sign"
	else
		run git tag -a "$tag" -m "$(message_for "$tag")"
	fi
done

if [ "$DO_PUSH" != 1 ]; then
	bold "Skipping push (--no-push). Push manually, in this order:"
	push_plan
	exit 0
fi

bold "Pushing"
if [ "$TARGET" = "bot" ] || [ "$TARGET" = "both" ]; then
	run git -C bot push origin "$BOT_BRANCH"
fi
if [ "$TARGET" = "webapp" ] || [ "$TARGET" = "both" ]; then
	run git -C webapp push origin "$WEBAPP_BRANCH"
fi
run git push origin "$ROOT_BRANCH"
run git push origin "${TAGS[@]}"

bold "Done"
printf 'Production deploys triggered by: %s\n' "${TAGS[*]}"
