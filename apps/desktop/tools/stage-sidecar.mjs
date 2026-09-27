// Stage the out-of-process connector host where Tauri's `externalBin` expects
// it: src-tauri/binaries/<name>-<target-triple>. Tauri does not build sidecars,
// so `beforeBuildCommand` runs this first.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/tools
const repoRoot = join(here, "..", "..", "..");
const srcTauri = join(here, "..", "src-tauri");

const triple = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host:"))
  ?.slice("host:".length)
  .trim();
if (!triple) {
  throw new Error("could not determine the host target triple");
}

// `--message-format=json` reports the exact executable path, so this works
// whatever CARGO_TARGET_DIR is set to.
const output = execFileSync(
  "cargo",
  [
    "build",
    "--release",
    "-p",
    "irodori-connector-host",
    "--message-format=json",
  ],
  { cwd: repoRoot, encoding: "utf8" },
);
let built;
for (const line of output.split("\n")) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  if (
    message.reason === "compiler-artifact" &&
    message.target?.name === "irodori-connector-host" &&
    message.executable
  ) {
    built = message.executable;
  }
}
if (!built) {
  throw new Error("cargo did not report a connector host executable");
}

const exe = triple.includes("windows") ? ".exe" : "";
const outDir = join(srcTauri, "binaries");
mkdirSync(outDir, { recursive: true });
copyFileSync(built, join(outDir, `irodori-connector-host-${triple}${exe}`));
console.log(`staged connector host for ${triple}`);
