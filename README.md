<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Irodori Table

Fast desktop database client for querying, browsing, editing, diagramming, and
checking data across many engines.

## Preview

![Irodori Table workbench preview](docs/assets/irodori-table-preview.png)

## Install

Download a package from the
[latest release](https://github.com/irodori-table/irodori-table/releases), or use
a package manager.

**Debian / Ubuntu** (signed APT repository):

```bash
curl -fsSL https://irodori-table.github.io/irodori-packages/apt/irodori-archive-keyring.gpg \
  | sudo tee /usr/share/keyrings/irodori-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/irodori-archive-keyring.gpg] https://irodori-table.github.io/irodori-packages/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/irodori.list
sudo apt update && sudo apt install irodori-table
```

**Arch Linux** (AUR):

```bash
yay -S irodori-table
```

**Linux (portable)**: download the `.AppImage`, make it executable, and run it.

**macOS / Windows**: download the universal `.dmg` or the setup `.exe`/`.msi`
from the [latest release](https://github.com/irodori-table/irodori-table/releases).

The APT and AUR channels are refreshed for stable releases only. Full
OS-specific steps, prerequisites, and troubleshooting live in the
[install guide](https://irodori-table.github.io/irodori-docs/install-guide.html).

## Update

**In the app** (stable builds): Irodori Table checks for a signed update at
startup. You can also run **Check for Updates** from **Tools** or the command
palette. Press **Install**, then restart the app. Preview and lightweight
pre-release builds have no updater, so update them with the commands below.
See [docs/updater.md](docs/updater.md).

**Windows** (PowerShell): quit the app, then download and run the latest setup
`.exe`. It replaces the installed version.

```powershell
$ProgressPreference = 'SilentlyContinue'
$release = Invoke-RestMethod https://api.github.com/repos/irodori-table/irodori-table/releases/latest
$asset = $release.assets | Where-Object name -like '*_x64-setup.exe'
$installer = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $installer
Start-Process $installer -Wait
```

**macOS**: quit the app, then replace it with the latest universal `.dmg`.

```bash
url=$(curl -fsSL https://api.github.com/repos/irodori-table/irodori-table/releases/latest \
  | grep -o '"browser_download_url": *"[^"]*_universal\.dmg"' | cut -d'"' -f4)
curl -fL "$url" -o /tmp/irodori-table.dmg
hdiutil attach /tmp/irodori-table.dmg -nobrowse -mountpoint /Volumes/irodori-table
rm -rf "/Applications/Irodori Table.app"
ditto "/Volumes/irodori-table/Irodori Table.app" "/Applications/Irodori Table.app"
hdiutil detach /Volumes/irodori-table
```

If macOS blocks an unsigned build, open **System Settings ▸ Privacy & Security**
and choose **Open Anyway**.

**Linux**:

```bash
sudo apt update && sudo apt install --only-upgrade irodori-table   # Debian / Ubuntu
yay -Syu irodori-table                                              # Arch Linux (AUR)
```

For the AppImage, download the new `.AppImage` and replace the old file.

## Privacy

Irodori Table does not upload telemetry or crash reports. It connects only to
endpoints selected or configured by the user and to documented project
endpoints needed for requested features, such as extension downloads and
release update checks. See [SECURITY.md](SECURITY.md) for local crash-report
handling and security scope.

## Develop

### 5-Minute Quickstart

1. Get a toolchain. On Linux with Nix, the repository ships a dev shell that
   pins everything `task doctor` checks — the exact Rust from
   `rust-toolchain.toml`, Node 24, mold, and the WebKitGTK/GTK libraries:

   ```sh
   nix develop        # or `direnv allow` to enter it automatically
   ```

   Inside that shell, start the app with `task run-dev` rather than
   `task desktop-dev`. WebKit from the Nix store cannot use a non-NixOS host's
   GL drivers and aborts before a window appears; `run-dev` wraps the launch in
   nixGL to supply matching ones. Set `IRODORI_NO_NIXGL=1` to opt out.

   Without Nix, install the platform prerequisites for your OS:
   [Windows](https://irodori-table.github.io/irodori-docs/windows-development.html),
   [macOS](https://irodori-table.github.io/irodori-docs/macos-development.html), or
   [Linux](https://irodori-table.github.io/irodori-docs/linux-development.html).
   Linux users should install the WebKitGTK and linker packages from that guide
   before running the desktop app. `mold` in particular is required:
   `.cargo/config.toml` links through it, and without it every link fails.
2. From the repository root, install dependencies and check the local setup:

   ```sh
   task setup
   task doctor
   ```

3. Start the desktop development shell:

   ```sh
   task desktop-dev
   ```

`task desktop-dev` starts the Tauri shell and Vite dev server. Run `make help`
for the full list of root commands.

Contributor setup, troubleshooting, and deeper development notes live in the
project docs:

- [Contributing](CONTRIBUTING.md)
- [Windows development](https://irodori-table.github.io/irodori-docs/windows-development.html)
- [macOS development](https://irodori-table.github.io/irodori-docs/macos-development.html)
- [Linux development](https://irodori-table.github.io/irodori-docs/linux-development.html)
- [Extension development](https://irodori-table.github.io/irodori-docs/extension-development.html)

## Release

Maintainers release from `main`. GitHub Actions builds the Windows and macOS
executables, so you do not need a Windows or Mac machine. You need the
[GitHub CLI](https://cli.github.com/) (`gh auth login`). Full details live in
[RELEASING.md](RELEASING.md).

```sh
# 1. Start from a clean, current main and run the local gate.
git switch main && git pull --ff-only
task desktop-format-check
task desktop-lint
task desktop-typegen-check
task desktop-test

# 2. Bump the version, commit, tag vX.Y.Z, and push.
#    The tag push builds the Linux pre-release (AppImage, deb, rpm).
task release-patch     # or release-minor / release-major

# 3. Build the Windows (.exe, .msi) and universal macOS (.dmg, .app) packages.
#    The stable channel adds them to the same release, adds the updater files,
#    and marks the release as Latest.
VERSION="v$(node -p "require('./apps/desktop/package.json').version")"
gh workflow run release.yml -f release_tag="$VERSION" -f channel=stable

# 4. Watch the run, then check the uploaded files.
gh run list --workflow release.yml --limit 3     # find the new run ID
gh run watch <run-id> --exit-status
gh release view "$VERSION" --json assets -q '.assets[].name'
```

When step 3 finishes, installed stable builds find the new version on their
next update check. Use `-f channel=preview` instead to add unsigned Windows and
macOS test builds to the pre-release without making it Latest.

### Build an executable locally

Tauri builds for the OS it runs on, so run each command on that OS. Run
`task setup` first. The output goes to `.irodori-local/target/`. Local builds
are unsigned and have no updater.

```sh
# Windows: NSIS setup .exe and .msi
npm --prefix apps/desktop run tauri build -- --bundles "nsis,msi" --config src-tauri/tauri.bundle.conf.json
# -> .irodori-local/target/release/bundle/nsis/ and .irodori-local/target/release/bundle/msi/

# macOS: universal .app and .dmg (Apple silicon + Intel)
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm --prefix apps/desktop run tauri build -- --target universal-apple-darwin --bundles "app,dmg" --config src-tauri/tauri.bundle.conf.json
# -> .irodori-local/target/universal-apple-darwin/release/bundle/dmg/
```

## Repos

- [`irodori-table`](https://github.com/irodori-table/irodori-table): desktop app.
- [`irodori-kit`](https://github.com/irodori-table/irodori-kit): shared app foundation crates and extension SDK.
- [`irodori-sql`](https://github.com/irodori-table/irodori-sql): SQL dialect, parameter, schema, and migration SQL helpers.
- [`irodori-knowledge`](https://github.com/irodori-table/irodori-knowledge): shared error, job, and knowledge-store primitives.
- [`irodori-migration`](https://github.com/irodori-table/irodori-migration): execution-free migration planning and diff crate.
- [`irodori-samples`](https://github.com/irodori-table/irodori-samples): local sample database containers.
- [`irodori-docs`](https://github.com/irodori-table/irodori-docs): public documentation site.
- [`irodori-archive`](https://github.com/irodori-table/irodori-archive): historical internal notes.

## Links

- User guide: [docs/README.md](docs/README.md)
- Docs: <https://irodori-table.github.io/irodori-docs/>
- Install guide: <https://irodori-table.github.io/irodori-docs/install-guide.html>
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Releasing: [RELEASING.md](RELEASING.md)
- Security: [SECURITY.md](SECURITY.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

License: `0BSD`.

## License

0BSD. You can use, copy, modify, and distribute this project for almost any purpose.
