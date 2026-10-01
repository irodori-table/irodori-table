#!/usr/bin/env node
// Build (and optionally sign) the Irodori Table Debian APT repository from
// released .deb packages.
//
// Layout produced under --repo:
//
//   pool/<component>/<letter>/<package>/<file>.deb
//   dists/<dist>/<component>/binary-<arch>/Packages
//   dists/<dist>/<component>/binary-<arch>/Packages.gz
//   dists/<dist>/Release
//   dists/<dist>/InRelease        (clearsigned, when signing)
//   dists/<dist>/Release.gpg      (detached, when signing)
//
// Control metadata is read straight out of each .deb through `ar` and `tar`,
// both present in base Linux images, so no dpkg/apt-ftparchive is needed and
// the exact same command runs in CI and on a developer machine.
//
// Usage:
//   node tools/release/apt-repo.mjs \
//     --input <dir-with-debs> --repo <repo-dir> \
//     --sign-key <gpg-fingerprint> [--gpg-home <dir>] [--passphrase-file <file>]
//
// Pass --allow-unsigned for a local dry run. --verify re-checks an existing
// tree instead of regenerating it.

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { runCapture } from "../lib/process.mjs";

const options = parseArgs(process.argv.slice(2));

if (options.verify) {
  await verifyRepo(options);
} else {
  await buildRepo(options);
}

function parseArgs(argv) {
  const parsed = {
    input: null,
    repo: null,
    dist: "stable",
    component: "main",
    origin: "Irodori Table",
    label: "Irodori Table",
    description: "Irodori Table APT repository",
    architectures: null,
    signKey: null,
    gpgHome: null,
    passphraseFile: null,
    keyringOut: null,
    allowUnsigned: false,
    verify: false,
    date: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        fail(`Missing value for ${arg}`);
      }
      return argv[index];
    };
    switch (arg) {
      case "--input":
        parsed.input = resolve(next());
        break;
      case "--repo":
        parsed.repo = resolve(next());
        break;
      case "--dist":
        parsed.dist = next();
        break;
      case "--component":
        parsed.component = next();
        break;
      case "--origin":
        parsed.origin = next();
        break;
      case "--label":
        parsed.label = next();
        break;
      case "--description":
        parsed.description = next();
        break;
      case "--architectures":
        parsed.architectures = next()
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        break;
      case "--sign-key":
        parsed.signKey = next();
        break;
      case "--gpg-home":
        parsed.gpgHome = resolve(next());
        break;
      case "--passphrase-file":
        parsed.passphraseFile = resolve(next());
        break;
      case "--keyring-out":
        parsed.keyringOut = resolve(next());
        break;
      case "--date":
        parsed.date = next();
        break;
      case "--allow-unsigned":
        parsed.allowUnsigned = true;
        break;
      case "--verify":
        parsed.verify = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.repo) {
    fail("--repo is required.");
  }
  if (!parsed.verify && !parsed.input) {
    fail("--input is required when building.");
  }
  if (!parsed.verify && !parsed.signKey && !parsed.allowUnsigned) {
    fail("Pass --sign-key, or --allow-unsigned for a local dry run.");
  }
  if (parsed.signKey && parsed.allowUnsigned) {
    fail("--sign-key and --allow-unsigned are mutually exclusive.");
  }
  return parsed;
}

function printUsage() {
  console.log(
    [
      "Usage: node tools/release/apt-repo.mjs --repo <dir> [--input <dir>] \\",
      "         [--dist stable] [--component main] [--sign-key <fpr>]",
      "         [--gpg-home <dir>] [--passphrase-file <file>] [--keyring-out <file>]",
      "         [--architectures amd64,arm64] [--allow-unsigned] [--verify]",
    ].join("\n"),
  );
}

async function buildRepo(options) {
  const poolRoot = join(options.repo, "pool", options.component);
  await mkdir(poolRoot, { recursive: true });

  const inputDebs = (await readdir(options.input))
    .filter((name) => name.endsWith(".deb"))
    .map((name) => join(options.input, name));
  if (inputDebs.length === 0) {
    fail(`No .deb files found in ${options.input}`);
  }

  const discovered = [];
  for (const debPath of inputDebs) {
    const control = await readControl(debPath);
    const packageName = requiredField(control, "Package", debPath);
    const version = requiredField(control, "Version", debPath);
    const architecture = normalizeArchitecture(
      requiredField(control, "Architecture", debPath),
      debPath,
    );
    const letter = packageName[0].toLowerCase();
    const packageDir = join(poolRoot, letter, packageName);
    await mkdir(packageDir, { recursive: true });
    const poolPath = join(packageDir, basename(debPath));
    await copyFile(debPath, poolPath);
    discovered.push({
      control,
      packageName,
      version,
      architecture,
      poolPath,
    });
  }

  // Re-scan the whole pool so earlier releases stay installable. New debs were
  // copied in above, so this also covers them.
  const entries = await collectPool(poolRoot);
  const all = [];
  for (const poolPath of entries) {
    const control = await readControl(poolPath);
    all.push({
      control,
      packageName: requiredField(control, "Package", poolPath),
      version: requiredField(control, "Version", poolPath),
      architecture: normalizeArchitecture(
        requiredField(control, "Architecture", poolPath),
        poolPath,
      ),
      poolPath,
    });
  }

  const requested = options.architectures ?? [
    ...new Set(all.map((entry) => entry.architecture)),
  ];
  const architectures = requested.sort();

  const distDir = join(options.repo, "dists", options.dist);
  await rm(distDir, { recursive: true, force: true });

  const staged = [];
  const releaseEntries = [];
  for (const architecture of architectures) {
    const packages = all
      .filter((entry) => entry.architecture === architecture)
      .sort(
        (a, b) =>
          a.packageName.localeCompare(b.packageName) ||
          compareVersions(a.version, b.version) ||
          basename(a.poolPath).localeCompare(basename(b.poolPath)),
      );
    if (packages.length === 0) {
      fail(`No packages found for architecture ${architecture}.`);
    }

    const binaryDir = join(
      distDir,
      options.component,
      `binary-${architecture}`,
    );
    await mkdir(binaryDir, { recursive: true });

    const stanzas = [];
    for (const entry of packages) {
      stanzas.push(
        await renderStanza(entry.control, entry.poolPath, options.repo),
      );
    }
    const packagesText = `${stanzas.join("\n")}\n`;
    const packagesPath = join(binaryDir, "Packages");
    await writeFile(packagesPath, packagesText, "utf8");
    // mtime 0 so the gzip is byte-identical for identical input.
    await writeFile(
      `${packagesPath}.gz`,
      gzipSync(Buffer.from(packagesText, "utf8"), { level: 9, mtime: 0 }),
    );
    staged.push(
      `${options.component}/binary-${architecture}/Packages`,
      `${options.component}/binary-${architecture}/Packages.gz`,
    );
  }

  const releaseText = await renderRelease({
    options,
    architectures,
    staged,
    distDir,
  });
  const releasePath = join(distDir, "Release");
  await writeFile(releasePath, releaseText, "utf8");

  if (options.signKey) {
    await signRelease(options, distDir, releasePath);
  } else {
    console.log("WARNING: repository is unsigned (--allow-unsigned).");
  }

  if (options.keyringOut) {
    await exportPublicKey(options, options.keyringOut);
  }

  console.log(
    `apt-repo: ${all.length} package(s), architectures: ${architectures.join(", ")}`,
  );
}

async function collectPool(poolRoot) {
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".deb")) {
        found.push(full);
      }
    }
  }
  await walk(poolRoot);
  return found.sort();
}

async function readControl(debPath) {
  // Extract into a scratch directory instead of streaming a fixed member name:
  // some .deb producers prefix members with `./`, and GNU tar's `-O control`
  // then misses. Extracting by directory handles both forms.
  const script = [
    "set -euo pipefail",
    'tmp="$(mktemp -d)"',
    "trap 'rm -rf \"$tmp\"' EXIT",
    'ar p "$1" control.tar.gz | tar -xz -C "$tmp"',
    'cat "$tmp/control"',
  ].join("\n");
  const { code, stdout, stderr } = await runCapture("bash", [
    "-c",
    script,
    "apt-repo",
    debPath,
  ]);
  if (code !== 0) {
    fail(`Could not read control from ${debPath}: ${stderr.trim()}`);
  }
  return parseControl(stdout);
}

function parseControl(text) {
  const fields = {};
  let currentKey = null;
  for (const line of text.split("\n")) {
    if (line.startsWith(" ") && currentKey) {
      fields[currentKey] += `\n${line.slice(1)}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    fields[key] = value;
    currentKey = key;
  }
  return fields;
}

async function renderStanza(control, poolPath, repoRoot) {
  const info = await stat(poolPath);
  const buffer = await readFile(poolPath);
  const filename = relative(repoRoot, poolPath).split("\\").join("/");
  const description = requiredField(control, "Description", poolPath);
  const lines = [
    `Package: ${requiredField(control, "Package", poolPath)}`,
    `Version: ${requiredField(control, "Version", poolPath)}`,
    `Architecture: ${normalizeArchitecture(requiredField(control, "Architecture", poolPath), poolPath)}`,
  ];
  if (control.Maintainer) {
    lines.push(`Maintainer: ${control.Maintainer}`);
  }
  if (control["Installed-Size"]) {
    lines.push(`Installed-Size: ${control["Installed-Size"]}`);
  }
  if (control.Depends) {
    lines.push(`Depends: ${control.Depends}`);
  }
  if (control.Section) {
    lines.push(`Section: ${control.Section}`);
  }
  if (control.Priority) {
    lines.push(`Priority: ${control.Priority}`);
  }
  lines.push(`Filename: ${filename}`);
  lines.push(`Size: ${info.size}`);
  lines.push(`MD5sum: ${hash(buffer, "md5")}`);
  lines.push(`SHA1: ${hash(buffer, "sha1")}`);
  lines.push(`SHA256: ${hash(buffer, "sha256")}`);
  lines.push(...renderDescription(description));
  return `${lines.join("\n")}\n`;
}

function renderDescription(description) {
  const [first, ...rest] = description.split("\n");
  const lines = [`Description: ${first}`];
  for (const line of rest) {
    lines.push(` ${line.length > 0 ? line : "."}`);
  }
  return lines;
}

async function renderRelease({ options, architectures, staged, distDir }) {
  const date = options.date
    ? new Date(options.date)
    : new Date(
        process.env.SOURCE_DATE_EPOCH
          ? Number(process.env.SOURCE_DATE_EPOCH) * 1000
          : Date.now(),
      );
  const header = [
    `Origin: ${options.origin}`,
    `Label: ${options.label}`,
    `Suite: ${options.dist}`,
    `Codename: ${options.dist}`,
    `Date: ${date.toUTCString()}`,
    `Architectures: ${architectures.join(" ")}`,
    `Components: ${options.component}`,
    `Description: ${options.description}`,
  ];

  const sums = { MD5Sum: [], SHA1: [], SHA256: [] };
  for (const relativePath of [...staged].sort()) {
    const buffer = await readFile(join(distDir, relativePath));
    const size = buffer.length;
    sums.MD5Sum.push(` ${hash(buffer, "md5")} ${size} ${relativePath}`);
    sums.SHA1.push(` ${hash(buffer, "sha1")} ${size} ${relativePath}`);
    sums.SHA256.push(` ${hash(buffer, "sha256")} ${size} ${relativePath}`);
  }

  return [
    ...header,
    "MD5Sum:",
    ...sums.MD5Sum,
    "SHA1:",
    ...sums.SHA1,
    "SHA256:",
    ...sums.SHA256,
    "",
  ].join("\n");
}

async function signRelease(options, distDir, releasePath) {
  const common = ["--batch", "--yes"];
  if (options.gpgHome) {
    common.push("--homedir", options.gpgHome);
  }
  if (options.passphraseFile) {
    common.push(
      "--pinentry-mode",
      "loopback",
      "--passphrase-file",
      options.passphraseFile,
    );
  }

  await runGpg([
    ...common,
    "--local-user",
    options.signKey,
    "--clearsign",
    "--output",
    join(distDir, "InRelease"),
    releasePath,
  ]);
  await runGpg([
    ...common,
    "--local-user",
    options.signKey,
    "--detach-sign",
    "--output",
    join(distDir, "Release.gpg"),
    releasePath,
  ]);
}

async function exportPublicKey(options, destination) {
  const args = ["--batch", "--yes"];
  if (options.gpgHome) {
    args.push("--homedir", options.gpgHome);
  }
  await mkdir(dirname(destination), { recursive: true });
  // Write straight to the destination: runCapture would decode the binary
  // keyring as UTF-8 and corrupt it.
  await runGpg([...args, "--output", destination, "--export", options.signKey]);
}

async function runGpg(args) {
  const { code, stderr } = await runCapture("gpg", args);
  if (code !== 0) {
    fail(`gpg ${args.join(" ")} failed: ${stderr.trim()}`);
  }
}

async function verifyRepo(options) {
  const distDir = join(options.repo, "dists", options.dist);
  const releasePath = join(distDir, "Release");
  const releaseText = await readFile(releasePath, "utf8");

  const declared = parseReleaseChecksums(releaseText);
  if (declared.length === 0) {
    fail(`No checksums found in ${releasePath}`);
  }
  for (const entry of declared) {
    const filePath = join(distDir, entry.path);
    const buffer = await readFile(filePath);
    if (buffer.length !== entry.size) {
      fail(`Size mismatch for ${entry.path}`);
    }
    if (hash(buffer, "sha256") !== entry.sha256) {
      fail(`SHA256 mismatch for ${entry.path}`);
    }
  }

  if (options.signKey || !options.allowUnsigned) {
    const inRelease = join(distDir, "InRelease");
    const { code, stderr } = await runCapture("gpg", [
      "--batch",
      "--verify",
      inRelease,
    ]);
    if (code !== 0) {
      fail(`InRelease signature did not verify: ${stderr.trim()}`);
    }
  }
  console.log(`apt-repo: verified ${declared.length} file(s) under ${distDir}`);
}

function parseReleaseChecksums(releaseText) {
  const lines = releaseText.split("\n");
  const start = lines.findIndex((line) => line.trim() === "SHA256:");
  if (start === -1) {
    return [];
  }
  const entries = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0 || !line.startsWith(" ")) {
      break;
    }
    const match = /^\s+(\S+)\s+(\d+)\s+(\S+)$/.exec(line);
    if (match) {
      entries.push({
        sha256: match[1],
        size: Number(match[2]),
        path: match[3],
      });
    }
  }
  return entries;
}

function hash(buffer, algorithm) {
  return createHash(algorithm).update(buffer).digest("hex");
}

function normalizeArchitecture(value, debPath) {
  switch (value) {
    case "amd64":
    case "arm64":
    case "armhf":
    case "i386":
      return value;
    case "x86_64":
      return "amd64";
    case "aarch64":
      return "arm64";
    default:
      fail(`Unsupported .deb architecture '${value}' in ${debPath}`);
  }
}

function requiredField(control, key, debPath) {
  const value = control[key];
  if (!value) {
    fail(`Missing ${key} field in ${debPath}`);
  }
  return value;
}

// Debian-style ordering for the dotted numeric versions Irodori publishes.
function compareVersions(a, b) {
  const left = a.split(/[.~-]/);
  const right = b.split(/[.~-]/);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? "0";
    const r = right[index] ?? "0";
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isNaN(ln) || Number.isNaN(rn)) {
      const compared = l.localeCompare(r);
      if (compared !== 0) {
        return compared;
      }
    } else if (ln !== rn) {
      return ln - rn;
    }
  }
  return 0;
}

function fail(message) {
  console.error(`apt-repo: ${message}`);
  process.exit(1);
}
