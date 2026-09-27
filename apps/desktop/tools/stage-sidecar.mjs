// Stage the out-of-process connector host where Tauri's `externalBin` expects
// it: src-tauri/binaries/irodori-connector-host-<target-triple>. Tauri does not
// build sidecars, so `beforeBuildCommand` runs this first.
//
// A native build (no `--target`) wants the host triple. A universal macOS build
// wants `universal-apple-darwin`, which Tauri's macOS lane requests but does not
// expose to this script, so on macOS we stage both names.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/tools
const repoRoot = join(here, "..", "..", "..");
const srcTauri = join(here, "..", "src-tauri");

const hostTriple = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host:"))
  ?.slice("host:".length)
  .trim();
if (!hostTriple) {
  throw new Error("could not determine the host target triple");
}

const outDir = join(srcTauri, "binaries");
mkdirSync(outDir, { recursive: true });

/** Build the sidecar for one target and return the built executable path. */
function buildFor(triple) {
  const output = execFileSync(
    "cargo",
    [
      "build",
      "--release",
      "-p",
      "irodori-connector-host",
      "--target",
      triple,
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
    throw new Error(
      `cargo did not report a connector host executable for ${triple}`,
    );
  }
  return built;
}

const staged = (triple) =>
  join(
    outDir,
    `irodori-connector-host-${triple}${triple.includes("windows") ? ".exe" : ""}`,
  );

copyFileSync(buildFor(hostTriple), staged(hostTriple));
console.log(`staged connector host for ${hostTriple}`);

if (process.platform === "darwin") {
  const archs = ["aarch64-apple-darwin", "x86_64-apple-darwin"];
  const universal = staged("universal-apple-darwin");
  execFileSync(
    "lipo",
    ["-create", "-output", universal, ...archs.map(buildFor)],
    { stdio: "inherit" },
  );
  console.log("staged universal connector host for universal-apple-darwin");
}
