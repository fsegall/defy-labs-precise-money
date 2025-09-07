#!/usr/bin/env bash
set -euo pipefail

PKG_PATH="packages/precise-money/package.json"
PKG_DIR="packages/precise-money"

die(){ echo "❌ $*" >&2; exit 1; }

# --- args ---
VER="${1:-}"
[[ -z "${VER}" ]] && die "Usage: scripts/release.sh X.Y.Z"
[[ "${VER}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version must be semver (e.g., 0.1.12)"

# --- sanity: repo root & branch ---
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "${REPO_ROOT}" ]] || die "Not inside a git repository"
cd "${REPO_ROOT}"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "${CURRENT_BRANCH}" == "main" ]] || die "Please run on 'main' (current: ${CURRENT_BRANCH})"

# ensure upstream set & up-to-date
git branch --set-upstream-to=origin/main main >/dev/null 2>&1 || true
git pull --ff-only

# --- sanity: paths ---
[[ -f "${PKG_PATH}" ]] || die "Missing ${PKG_PATH}"
[[ -f "README.md" ]] || die "Missing root README.md"

# --- keep working tree clean ---
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree not clean. Commit/stash your changes first."
fi

# --- sync README into package & ensure files includes it ---
mkdir -p "${PKG_DIR}"
cp -f README.md "${PKG_DIR}/README.md"

node -e "
const fs=require('fs');
const p='${PKG_PATH}';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.version='${VER}';
j.files = Array.from(new Set([...(j.files||[]),'README.md','LICENSE'].filter(Boolean)));
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
"

# --- show diff & confirm ---
echo "About to commit version bump to ${VER}:"
git --no-pager diff -- ${PKG_PATH} ${PKG_DIR}/README.md || true

# --- commit & push ---
git add "${PKG_PATH}" "${PKG_DIR}/README.md"
git commit -m "release: v${VER}"
git push origin main

# --- create & push tag ---
TAG="v${VER}"
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  die "Tag ${TAG} already exists locally. Delete it first if you want to re-tag."
fi
git tag -a "${TAG}" -m "release: ${TAG}"
git push origin "${TAG}"

# --- verify tag contents ---
VLINE="$(git show ${TAG}:${PKG_PATH} | grep -m1 '\"version\"')"
echo "Tag ${TAG} contains: ${VLINE}"
if ! echo "${VLINE}" | grep -q "\"${VER}\""; then
  die "Tag ${TAG} does not point to a commit with version ${VER} in ${PKG_PATH}"
fi

echo "✅ Release ${TAG} pushed."
echo "ℹ️  GitHub Actions should publish to npm if workflow is configured for tag pushes."