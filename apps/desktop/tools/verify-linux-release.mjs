import { constants } from "node:fs";
import { access, mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { newestFileByExtension } from "../../../tools/lib/files.mjs";
import { fromDesktopRoot, fromRepoRoot } from "../../../tools/lib/paths.mjs";
import { runWithTimeout } from "../../../tools/lib/process.mjs";

const options = parseArgs(process.argv.slice(2));
const profile = options.debug ? "debug" : "release";
const cargoTargetDir = resolve(
  process.env.CARGO_TARGET_DIR ?? fromRepoRoot(".irodori-local/target"),
);
const bundleRoot = resolve(cargoTargetDir, profile, "bundle");
const appImage = await requiredBundle("appimage", ".AppImage");
const deb = await requiredBundle("deb", ".deb");
const rpm = await requiredBundle("rpm", ".rpm");

const pkg = JSON.parse(await readFile(fromDesktopRoot("package.json"), "utf8"));
await verifyAppImage(appImage, pkg.version);
await verifyPackage(deb, pkg.version, "Debian", Buffer.from("!<arch>\n"));
await verifyPackage(
  rpm,
  pkg.version,
  "RPM",
  Buffer.from([0xed, 0xab, 0xee, 0xdb]),
);
console.log(`linux-release: ok (${appImage}, ${deb}, ${rpm})`);

function parseArgs(argv) {
  return {
    debug: argv.includes("--debug"),
    skipExec: argv.includes("--skip-exec"),
  };
}

async function requiredBundle(directory, extension) {
  const bundleDir = resolve(bundleRoot, directory);
  const file = await newestFileByExtension(bundleDir, extension);
  if (!file) {
    fail(`No ${extension} package found under ${bundleDir}`);
  }
  return file;
}

async function verifyAppImage(file, version) {
  const info = await stat(file);
  if (!info.isFile()) {
    fail(`AppImage path is not a file: ${file}`);
  }
  if (info.size < 1_000_000) {
    fail(`AppImage is suspiciously small (${info.size} bytes): ${file}`);
  }
  await access(file, constants.X_OK).catch(() => {
    fail(`AppImage is not executable: ${file}`);
  });
  if (!file.includes(version)) {
    fail(
      `AppImage filename does not include package version ${version}: ${file}`,
    );
  }

  const handle = await open(file, "r");
  const header = Buffer.alloc(4);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  if (
    header[0] !== 0x7f ||
    header[1] !== 0x45 ||
    header[2] !== 0x4c ||
    header[3] !== 0x46
  ) {
    fail(`AppImage is not an ELF executable: ${file}`);
  }

  if (!options.skipExec) {
    await runAppImageHelp(file);
    await verifyExcludedLibraries(file);
  }
}

/**
 * Libraries the AppImage must leave to the host (#214).
 *
 * `libwayland-client.so.0` talks to the running compositor. Shipped inside the
 * bundle, the host's Mesa `libEGL` resolves against our copy instead of the
 * system one and `eglGetPlatformDisplay` fails, so the app aborts with
 * `EGL_BAD_PARAMETER` before a window appears — on every host whose wayland
 * stack is newer than the build runner's. It is on the upstream AppImage
 * excludelist for that reason.
 *
 * `scripts/appimage-exclude-host-libs.sh` strips it during bundling. This is
 * the guard: if that shim ever stops being applied, the release fails here
 * rather than shipping an AppImage that cannot start.
 */
const excludedLibraries = ["libwayland-client.so.0"];

async function verifyExcludedLibraries(file) {
  // `--appimage-extract <pattern>` is served by the AppImage runtime embedded
  // in the file itself, so this needs no squashfs tooling on the runner. It
  // writes into ./squashfs-root, hence the scratch directory.
  const scratch = await mkdtemp(join(tmpdir(), "irodori-appimage-"));
  try {
    for (const library of excludedLibraries) {
      const { code, output } = await runWithTimeout(
        file,
        ["--appimage-extract", `usr/lib/${library}`],
        60_000,
        { cwd: scratch },
      );
      if (code !== 0) {
        fail(`AppImage --appimage-extract exited ${code}: ${output.trim()}`);
      }
      const extracted = join(scratch, "squashfs-root", "usr", "lib", library);
      if (await exists(extracted)) {
        fail(
          `AppImage bundles ${library}, which must come from the host: ${file}. ` +
            `See scripts/appimage-exclude-host-libs.sh (#214).`,
        );
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function exists(path) {
  return access(path, constants.F_OK).then(
    () => true,
    () => false,
  );
}

async function verifyPackage(file, version, label, magic) {
  const info = await stat(file);
  if (!info.isFile()) {
    fail(`${label} package path is not a file: ${file}`);
  }
  if (info.size < 1_000_000) {
    fail(
      `${label} package is suspiciously small (${info.size} bytes): ${file}`,
    );
  }
  if (!file.includes(version)) {
    fail(
      `${label} package filename does not include version ${version}: ${file}`,
    );
  }

  const handle = await open(file, "r");
  const header = Buffer.alloc(magic.length);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  if (!header.equals(magic)) {
    fail(`${label} package has an invalid file signature: ${file}`);
  }
}

async function runAppImageHelp(file) {
  const { code, output } = await runWithTimeout(
    file,
    ["--appimage-help"],
    10_000,
  );
  if (code !== 0) {
    fail(`AppImage --appimage-help exited ${code}: ${output.trim()}`);
  }
  if (!/AppImage/i.test(output)) {
    fail(`AppImage --appimage-help did not print AppImage help text`);
  }
}

function fail(message) {
  console.error(`linux-release: ${message}`);
  process.exit(1);
}
