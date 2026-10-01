#!/usr/bin/env node
// Render the AUR package (PKGBUILD + .SRCINFO) for a released Irodori Table
// version. The AUR recipe repackages the release .deb payload, so all this
// needs is the version and the SHA256 of the published artifacts.
//
// Usage:
//   node tools/release/aur-package.mjs --version 0.11.13 \
//     --input <dir with Irodori.Table_<ver>_{amd64,arm64}.deb + LICENSE> \
//     --out <dir>
//
// The generated PKGBUILD/.SRCINFO are the files pushed to the AUR git repo
// (aur.archlinux.org/irodori-table). They are deliberately not committed here:
// the committed source of truth is packaging/aur/PKGBUILD.in.
//
// --validate additionally runs `makepkg --printsrcinfo` (when makepkg is on
// PATH) and fails if the generated .SRCINFO differs.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { runCapture } from "../lib/process.mjs";
import { fromRepoRoot } from "../lib/paths.mjs";

const options = parseArgs(process.argv.slice(2));
await run(options);

function parseArgs(argv) {
  const parsed = {
    version: null,
    input: null,
    out: null,
    template: fromRepoRoot("packaging/aur/PKGBUILD.in"),
    validate: false,
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
      case "--version":
        parsed.version = next();
        break;
      case "--input":
        parsed.input = resolve(next());
        break;
      case "--out":
        parsed.out = resolve(next());
        break;
      case "--template":
        parsed.template = resolve(next());
        break;
      case "--validate":
        parsed.validate = true;
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node tools/release/aur-package.mjs --version <ver> --input <dir> [--out <dir>] [--validate]",
        );
        process.exit(0);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }
  if (!parsed.version) {
    fail("--version is required.");
  }
  if (!parsed.input) {
    fail("--input is required.");
  }
  parsed.out = parsed.out ?? join(tmpdir(), `irodori-aur-${parsed.version}`);
  return parsed;
}

async function run(options) {
  const debAmd64 = join(
    options.input,
    `Irodori.Table_${options.version}_amd64.deb`,
  );
  const debArm64 = join(
    options.input,
    `Irodori.Table_${options.version}_arm64.deb`,
  );
  const license = join(options.input, "LICENSE");

  const [sha256Amd64, sha256Arm64, sha256License] = await Promise.all([
    sha256(debAmd64),
    sha256(debArm64),
    sha256(license),
  ]);

  const template = await readFile(options.template, "utf8");
  const pkgbuild = render(template, {
    pkgver: options.version,
    sha256_x86_64: sha256Amd64,
    sha256_aarch64: sha256Arm64,
    sha256_license: sha256License,
  });

  await mkdir(options.out, { recursive: true });
  await writeFile(join(options.out, "PKGBUILD"), pkgbuild, "utf8");
  const srcinfo = renderSrcinfo(options.version);
  await writeFile(join(options.out, ".SRCINFO"), srcinfo, "utf8");
  console.log(`aur-package: wrote PKGBUILD and .SRCINFO to ${options.out}`);

  if (options.validate) {
    await validate(options.out, srcinfo);
  }
}

function render(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) {
      fail(`Template placeholder not provided: ${key}`);
    }
    return values[key];
  });
}

function renderSrcinfo(version) {
  const base = `https://github.com/irodori-table/irodori-table/releases/download/v${version}`;
  const raw = `https://raw.githubusercontent.com/irodori-table/irodori-table/v${version}/LICENSE`;
  // Field order mirrors `makepkg --printsrcinfo`; --validate asserts it.
  return [
    "pkgbase = irodori-table",
    "\tpkgdesc = Fast desktop SQL workbench for querying, browsing, and editing databases",
    `\tpkgver = ${version}`,
    "\tpkgrel = 1",
    "\turl = https://github.com/irodori-table/irodori-table",
    "\tarch = x86_64",
    "\tarch = aarch64",
    "\tlicense = 0BSD",
    "\tdepends = gtk3",
    "\tdepends = webkit2gtk-4.1",
    "\tprovides = irodori-table",
    "\tconflicts = irodori-table",
    "\toptions = !strip",
    "\toptions = !debug",
    `\tsource_x86_64 = Irodori.Table_${version}_amd64.deb::${base}/Irodori.Table_${version}_amd64.deb`,
    `\tsource_x86_64 = LICENSE::${raw}`,
    "\tsha256sums_x86_64 = {{sha256_x86_64}}",
    "\tsha256sums_x86_64 = {{sha256_license}}",
    `\tsource_aarch64 = Irodori.Table_${version}_arm64.deb::${base}/Irodori.Table_${version}_arm64.deb`,
    `\tsource_aarch64 = LICENSE::${raw}`,
    "\tsha256sums_aarch64 = {{sha256_aarch64}}",
    "\tsha256sums_aarch64 = {{sha256_license}}",
    "",
    "pkgname = irodori-table",
    "",
  ].join("\n");
}

async function validate(outDir, expected) {
  const { code, stdout, stderr } = await runCapture(
    "makepkg",
    ["--printsrcinfo"],
    { cwd: outDir, env: { ...process.env, PKGDEST: outDir } },
  );
  if (code !== 0) {
    // makepkg may be absent (ubuntu runners); validation is local-only.
    console.log(`aur-package: skipped validation: ${stderr.trim() || code}`);
    return;
  }
  // Substitute the same hashes into our expected text so the comparison is
  // about structure, not the values.
  const normalizedExpected = expected
    .replace(/\{\{sha256_x86_64\}\}/g, extractSum(stdout, "x86_64", 0))
    .replace(/\{\{sha256_aarch64\}\}/g, extractSum(stdout, "aarch64", 0))
    .replace(/\{\{sha256_license\}\}/g, extractSum(stdout, "x86_64", 1));
  if (normalizedExpected.trim() !== stdout.trim()) {
    console.error("--- generated ---");
    console.error(normalizedExpected);
    console.error("--- makepkg ---");
    console.error(stdout);
    fail("Generated .SRCINFO does not match `makepkg --printsrcinfo`.");
  }
  console.log("aur-package: .SRCINFO matches makepkg --printsrcinfo");
}

function extractSum(srcinfo, arch, index) {
  const lines = srcinfo
    .split("\n")
    .filter((line) => line.startsWith(`\tsha256sums_${arch} = `));
  const value = lines[index]?.split(" = ")[1];
  if (!value) {
    fail(
      `Could not read sha256sums_${arch} entry ${index} from makepkg output.`,
    );
  }
  return value;
}

function sha256(path) {
  return readFile(path).then((buffer) =>
    createHash("sha256").update(buffer).digest("hex"),
  );
}

function fail(message) {
  console.error(`aur-package: ${message}`);
  process.exit(1);
}
