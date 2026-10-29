#!/usr/bin/env bash
# Builds copies of this site's search index at /pagefind/v<major.minor>/, one for every Pagefind minor version from the
# oldest a Valkey site runs up to the newest release. Pagefind only merges indexes built with its own minor version, so
# this site must provide any version other sites may need.
#
#   scripts/index-copies.sh build   produces the necessary indexes for other sites to consume
#   scripts/index-copies.sh check   checks current Pagefind is compatible with indexes hosted by other sites
#
# Both fail if a site that has set up cross-site search has no copy for this build's Pagefind minor version yet.
# Redeploying that site usually adds the copy.

set -euo pipefail
case ${1:-} in build | check) ;; *) echo "usage: $0 build|check" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."
OTHER_SITES=$(jq -r '.otherSites[]' src/cross-site-search.json)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

minor_version() { cut -d. -f1-2 <<< "$1"; }  # 1.5.2 -> 1.5

# Prints the Pagefind version of the index at $1, "none" if it has no usable index (a 404, or an entry file without a
# release number), or "down" for anything else, such as a 503 or no answer.
index_state() {
  local status version
  rm -f "$TMP/entry.json"  # clean any prior state
  status=$(curl -sS --retry 3 --retry-connrefused --max-time 20 -o "$TMP/entry.json" -w '%{http_code}' \
    "${1}pagefind-entry.json" 2>/dev/null) || status=failed
  case $status in
    404) echo none; return ;;
    200) ;;
    *) echo down; return ;;
  esac
  version=$(jq -r .version "$TMP/entry.json" 2>/dev/null) || version=
  if [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$version"
  else
    echo none
  fi
}

check_other_sites() {
  local this_minor index version missing=()
  this_minor=$(minor_version "$1")
  for index in $OTHER_SITES; do
    # Check whether the site has any Pagefind index at all.
    version=$(index_state "$index")
    case $version in
      none) continue ;;
      down) missing+=("$index"); continue ;;
    esac
    # Check whether the site publishes its own version-specific index version.
    case $(index_state "${index}v$(minor_version "$version")/") in
      none) continue ;;  # hasn't set up cross-site search
      down) missing+=("$index"); continue ;;
    esac
    # Check whether the needed version is available.
    case $(index_state "${index}v${this_minor}/") in
      none | down) missing+=("$index") ;;
    esac
  done
  [ "${#missing[@]}" -gt 0 ] || return 0

  cat >&2 << EOF
::error::These sites have no copy of their search index for Pagefind ${this_minor} yet, or can't be reached: ${missing[*]}
Deployed now, this site's search would leave them out. Either:
  - redeploy them first, which adds a ${this_minor} copy if ${this_minor} is within the versions they publish.
  - keep this site on the Pagefind version it uses now.
EOF
  return 1
}

# Index versions to publish from this site. Finds the oldest version a Valkey site uses, and gathers each minor version
# of Pagefind published since up to the newest release.
versions_to_copy() {
  local in_use=("$1") index state oldest
  for index in $OTHER_SITES; do
    state=$(index_state "$index")
    case $state in
      none) echo "::warning::${index} has no index; its version isn't counted" >&2 ;;
      # Without its version, this deploy could stop publishing the copy that site's search uses.
      down) echo "::error::${index} can't be reached; re-run this deploy once it can" >&2; return 1 ;;
      *) echo "${index} runs Pagefind ${state}" >&2; in_use+=("$state") ;;
    esac
  done
  oldest=$(printf '%s\n' "${in_use[@]}" | sort -V | head -1)
  curl -fsS --retry 3 --retry-connrefused --max-time 20 https://registry.npmjs.org/pagefind | jq -r --arg oldest "$(minor_version "$oldest")" '
    def minor: split(".")[:2] | map(tonumber);
    .versions | keys
    | map(select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$")))                    # releases, not pre-releases
    | map(select(minor >= ($oldest | minor)))                            # from the oldest minor version in use
    | group_by(minor) | map(max_by(split(".") | map(tonumber))) | .[]    # the newest patch of each
  '
}

# Downloads Pagefind $1 to $TMP/$1/pagefind.
download_pagefind() {
  local dir asset url
  dir=$TMP/$1
  case $(uname -s)-$(uname -m) in
    Linux-x86_64 | Linux-aarch64) asset="pagefind-v$1-$(uname -m)-unknown-linux-musl.tar.gz" ;;
    Darwin-arm64) asset="pagefind-v$1-aarch64-apple-darwin.tar.gz" ;;
    Darwin-x86_64) asset="pagefind-v$1-x86_64-apple-darwin.tar.gz" ;;
    *) echo "no Pagefind release for $(uname -s) $(uname -m)" >&2; return 1 ;;
  esac
  url="https://github.com/Pagefind/pagefind/releases/download/v$1/${asset}"
  mkdir -p "$dir"
  curl -fsSL --retry 3 --max-time 300 "$url" -o "$dir/$asset"
  curl -fsSL --retry 3 --max-time 60 "$url.sha256" -o "$dir/$asset.sha256"
  if command -v sha256sum > /dev/null; then
    (cd "$dir" && sha256sum -c --quiet "$asset.sha256")
  else
    (cd "$dir" && shasum -a 256 -c --quiet "$asset.sha256")  # macOS has shasum instead
  fi
  tar -xzf "$dir/$asset" -C "$dir"
}

this_version=$(jq -er .version dist/pagefind/pagefind-entry.json)
check_other_sites "$this_version"
[ "$1" = build ] || exit 0

# Through a file, since a failure inside $(...) wouldn't stop the script.
versions_to_copy "$this_version" > "$TMP/versions"
for version in $(< "$TMP/versions"); do
  echo "Building a Pagefind ${version} copy at pagefind/v$(minor_version "$version")/"
  download_pagefind "$version"
  "$TMP/$version/pagefind" --site dist --output-path "dist/pagefind/v$(minor_version "$version")"
done
