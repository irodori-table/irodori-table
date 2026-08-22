#!/usr/bin/env node
/**
 * Regression check for #182: `--force` must not revert implemented drivers.
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
 * This drives the real script against a throwaway extensions root and asserts
 * the behaviour both ways, because the decision lives inline in a 3,500-line
 * generator with nothing importable to unit-test.
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
  "scaffold-preserve: ok (--force preserves implemented drivers, --force-drivers overwrites)",
);
