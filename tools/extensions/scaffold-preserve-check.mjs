#!/usr/bin/env node
/**
 * Regression check for #182 and #232: scaffolding must not revert maintained
 * drivers, metadata, documentation or build files.
 *
 * `scaffold-connector-repos.mjs` writes a shared DuckDB driver template into
 * every DuckDB-backed connector repo. Several of those repos have since
 * diverged from it on purpose, and their `src/lib.rs` declares the extra
 * modules those fixes added. A `--force` run used to overwrite both files,
 * silently reverting the fixes, including the `read_parquet` glob that returns
 * wrong rows for Hudi (#117).
 *
 * The fixture was Hudi until the lakehouse connectors moved to the
 * irodori-lakehouse registry; MotherDuck stands in for them here because the
 * behaviour under test is the generator's, not any one connector's.
 *
 * Drive the real script against a throwaway extensions root, including the
 * explicit Rust-reset option and the defaults for newly bootstrapped repos.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const scaffold = resolve(scriptDir, "scaffold-connector-repos.mjs");

const DRIVER_SENTINEL = "// FIXED DRIVER: hand-tuned, do not revert";
const REPO = "irodori-extension-motherduck";

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

/** A repo that looks implemented: a real driver plus a module wired in lib.rs. */
function seedImplementedRepo(extensionsRoot) {
  const src = resolve(extensionsRoot, REPO, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(resolve(src, "driver.rs"), `${DRIVER_SENTINEL}\nfn resolve_slices() {}\n`);
  writeFileSync(resolve(src, "lib.rs"), "mod driver;\nmod service;\n");
  writeFileSync(resolve(src, "service.rs"), "// service token handling\n");
}

function runScaffold(extensionsRoot, args) {
  const result = spawnSync("node", [scaffold, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      IRODORI_EXTENSIONS_ROOT: extensionsRoot,
      IRODORI_SKIP_RUSTFMT: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `scaffold ${args.join(" ")} exited ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function read(extensionsRoot, file) {
  return readFileSync(resolve(extensionsRoot, REPO, "src", file), "utf8");
}

function seedMaintainedFiles(extensionsRoot) {
  const files = new Map();
  for (const file of [
    "connector.source.json",
    "connector.config.json",
    "irodori.extension.json",
    "README.md",
    "README.ja.md",
    "Cargo.toml",
    "Cargo.lock",
    ".cargo/config.toml",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "Makefile",
    ".gitignore",
    "LICENSE-MIT",
    "LICENSE-0BSD",
    "native/source/README.md",
    "native/source/irodori-kit/irodori-core/src/lib.rs",
  ]) {
    const path = resolve(extensionsRoot, REPO, file);
    const content = `maintained ${file}: tokens only, current dependencies, bilingual docs\n`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    files.set(path, content);
  }
  return files;
}

function checkMaintainedFiles(files, option) {
  for (const [path, content] of files) {
    check(readFileSync(path, "utf8") === content, `${option} overwrote ${path}`);
  }
}

const workdir = mkdtempSync(resolve(tmpdir(), "irodori-scaffold-check-"));
try {
  // --- --force keeps the implemented sources ---
  const preserveRoot = resolve(workdir, "preserve");
  seedImplementedRepo(preserveRoot);
  const preserveLog = runScaffold(preserveRoot, ["--force"]);

  check(
    read(preserveRoot, "driver.rs").includes(DRIVER_SENTINEL),
    "--force overwrote src/driver.rs in an implemented repo",
  );
  check(
    read(preserveRoot, "lib.rs").includes("mod service;"),
    "--force overwrote src/lib.rs and orphaned the repo's extra module",
  );
  check(
    read(preserveRoot, "service.rs").includes("service token handling"),
    "--force removed the repo's extra module",
  );
  check(
    preserveLog.includes("keeping its Rust sources"),
    "--force did not report that it preserved the Rust sources",
  );
  // The rest of the repo must still regenerate, or --force would do nothing.
  check(
    readFileSync(resolve(preserveRoot, REPO, "irodori.extension.json"), "utf8").length > 0,
    "--force did not regenerate the manifest",
  );

  // --- --force-drivers is the explicit escape hatch ---
  const overwriteRoot = resolve(workdir, "overwrite");
  seedImplementedRepo(overwriteRoot);
  const overwriteLog = runScaffold(overwriteRoot, ["--force-drivers"]);

  check(
    !read(overwriteRoot, "driver.rs").includes(DRIVER_SENTINEL),
    "--force-drivers left the old driver in place",
  );
  check(
    overwriteLog.includes("OVERWRITING its Rust sources"),
    "--force-drivers did not warn that it was overwriting the Rust sources",
  );

  // Maintained metadata, docs and dependency pins must survive both options.
  for (const option of ["--force", "--force-drivers"]) {
    const maintainedRoot = resolve(workdir, `maintained-${option.slice(2)}`);
    seedImplementedRepo(maintainedRoot);
    const files = seedMaintainedFiles(maintainedRoot);
    const log = runScaffold(maintainedRoot, [option]);
    checkMaintainedFiles(files, option);
    check(
      log.includes("keeping existing metadata"),
      `${option} did not report metadata preservation`,
    );
    runScaffold(maintainedRoot, [option, "--dry-run"]);
    checkMaintainedFiles(files, `${option} --dry-run`);
  }

  // Fresh scaffolds must not reintroduce the agreed auth-deletion queue.
  for (const [engine, removed] of [
    ["mongodb", ["kerberos"]],
    ["motherduck", ["oauth2", "browserSso"]],
    ["snowflake", ["browserSso", "saml", "externalBrowser"]],
    ["couchbase", ["saml"]],
  ]) {
    const config = JSON.parse(
      readFileSync(
        resolve(overwriteRoot, `irodori-extension-${engine}`, "connector.config.json"),
        "utf8",
      ),
    );
    const ids = config.connector.connection.authMethods.map(({ id }) => id);
    for (const id of removed) {
      check(!ids.includes(id), `fresh ${engine} scaffold reintroduced ${id}`);
    }
  }
  // Cargo, CI and release must consume one kit generation for new repos too.
  for (const engine of ["motherduck", "snowflake"]) {
    const repoDir = resolve(overwriteRoot, `irodori-extension-${engine}`);
    const tag = readFileSync(resolve(repoDir, "Cargo.toml"), "utf8").match(/tag = "([^"]+)"/)?.[1];
    check(Boolean(tag), `fresh ${engine} scaffold has no kit tag`);
    for (const workflow of ["ci", "release"]) {
      check(
        readFileSync(resolve(repoDir, ".github/workflows", `${workflow}.yml`), "utf8").includes(
          `.yml@${tag}`,
        ),
        `fresh ${engine} ${workflow} workflow has a different kit tag from Cargo`,
      );
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("scaffold-preserve: FAILED");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  "scaffold-preserve: ok (maintained files preserved, explicit Rust reset, auth deletions, consistent kit pins)",
);
