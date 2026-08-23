#!/usr/bin/env node

/**
 * Fail when the stable release users actually download has fallen behind.
 *
 * `task release-*` pushes a `v*` tag, and the tag trigger in `release.yml`
 * resolves `inputs.channel || 'lightweight'` — so an automated release is
 * always `prerelease=true`. Only a manual `stable` dispatch publishes with
 * `--latest=true`. Nothing enforced that a stable dispatch ever followed, and
 * for nine consecutive releases none did: `releases/latest` sat on v0.8.5 from
 * 2026-07-30 to 2026-08-23 while v0.8.6 through v0.8.14 piled up as
 * pre-releases nobody is offered.
 *
 * That is not a cosmetic lag. v0.8.5 is the build from #214 that aborts with
 * `EGL_BAD_PARAMETER` before a window appears on any Mesa/Wayland host, and
 * the fix shipped in v0.8.6. Every route a user takes to install — the
 * Releases page, `gh release download` with no tag, `soar`, anything that
 * resolves `/releases/latest` — handed them the one build that cannot start,
 * for three weeks after it was fixed.
 *
 * The invariant this guard encodes: **the pre-release channel may run one
 * release ahead of stable, never two.** One is the normal working state — a
 * lightweight tag release exists and its stable dispatch has not happened yet.
 * Two means a release was cut on top of an un-promoted one, which is the
 * moment the drift starts compounding silently.
 *
 * Usage:
 *
 *   node tools/release/check-stable-latest.mjs [--repo owner/name]
 *
 * The repository defaults to `GITHUB_REPOSITORY`, then the `origin` remote.
 * `GITHUB_TOKEN` is used when present; the check works unauthenticated against
 * a public repository, subject to the anonymous rate limit.
 */

import { execFileSync } from "node:child_process";

/**
 * Published releases allowed to sit ahead of the stable `Latest` pointer.
 *
 * One, not zero: `task release-*` publishes the lightweight pre-release first
 * and the stable dispatch is a separate deliberate step, so a gap of one is
 * the expected state between those two actions rather than a defect.
 */
const maxDrift = 1;

const repository = resolveRepository(process.argv.slice(2));
const releases = await publishedReleases(repository);

if (releases.length === 0) {
  console.log(`stable-latest: ${repository} has no published v* releases yet`);
  process.exit(0);
}

const stable = await stableLatest(repository);
if (!stable) {
  fail(
    `${repository} has ${releases.length} published release(s) but no stable ` +
      `Latest — every one of them is a pre-release, so the Releases page and ` +
      `anything resolving /releases/latest offers users nothing.`,
    releases,
  );
}

const ahead = releases.filter(
  (release) => compareVersions(release.version, stable.version) > 0,
);

if (ahead.length > maxDrift) {
  fail(
    `stable Latest is ${stable.tag}, but ${ahead.length} newer release(s) are ` +
      `published as pre-releases. Users installing from the Releases page get ` +
      `${stable.tag}. Dispatch the stable channel for ${ahead[0].tag}: ` +
      `gh workflow run release.yml -f release_tag=${ahead[0].tag} -f channel=stable`,
    ahead,
  );
}

if (ahead.length > 0) {
  console.log(
    `stable-latest: ok — Latest is ${stable.tag}, with ${ahead[0].tag} awaiting its stable dispatch`,
  );
} else {
  console.log(`stable-latest: ok — Latest is ${stable.tag}, the newest release`);
}

function fail(message, releases) {
  console.error(`stable-latest: ${message}`);
  if (releases?.length) {
    console.error("");
    for (const release of releases) {
      console.error(
        `  ${release.tag}\tprerelease=${release.prerelease}\t${release.publishedAt ?? "unpublished"}`,
      );
    }
  }
  process.exit(1);
}

/** Non-draft `vX.Y.Z` releases, newest first. */
async function publishedReleases(repository) {
  const releases = await githubJson(
    `https://api.github.com/repos/${repository}/releases?per_page=100`,
  );
  return releases
    .filter((release) => !release.draft)
    .map(toRelease)
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version));
}

/**
 * The release GitHub serves as `Latest`.
 *
 * Read through `/releases/latest` rather than picking the newest non-prerelease
 * out of the list: that endpoint is the pointer installers actually resolve, so
 * checking anything else would verify a different fact than the one that broke.
 */
async function stableLatest(repository) {
  const response = await githubFetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    { allowNotFound: true },
  );
  if (response.status === 404) {
    return undefined;
  }
  return toRelease(await response.json());
}

function toRelease(release) {
  const version = parseVersion(release?.tag_name);
  if (!version) {
    return undefined;
  }
  return {
    tag: release.tag_name,
    version,
    prerelease: Boolean(release.prerelease),
    publishedAt: release.published_at,
  };
}

function parseVersion(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(String(tag ?? ""));
  return match ? match.slice(1, 4).map(Number) : undefined;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function resolveRepository(argv) {
  const flag = argv.indexOf("--repo");
  if (flag !== -1) {
    const value = argv[flag + 1];
    if (!value) {
      throw new Error("--repo needs an owner/name argument");
    }
    return parseRepository(value);
  }
  for (const arg of argv) {
    throw new Error(`unknown argument: ${arg}`);
  }
  if (process.env.GITHUB_REPOSITORY) {
    return parseRepository(process.env.GITHUB_REPOSITORY);
  }
  return parseRepository(
    execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim(),
  );
}

function parseRepository(value) {
  const normalized = String(value)
    .trim()
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  if (!/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
    throw new Error(`not a GitHub owner/name repository: ${value}`);
  }
  return normalized;
}

async function githubJson(url) {
  const response = await githubFetch(url);
  return response.json();
}

async function githubFetch(url, { allowNotFound = false } = {}) {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "user-agent": "irodori-stable-latest-check",
    "x-github-api-version": "2022-11-28",
  });
  if (process.env.GITHUB_TOKEN) {
    headers.set("authorization", `Bearer ${process.env.GITHUB_TOKEN}`);
  }
  const response = await fetch(url, { headers });
  if (allowNotFound && response.status === 404) {
    return response;
  }
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response;
}
