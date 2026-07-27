# Changelog

All notable changes to Irodori Table are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0: minor versions may include breaking changes).

## Release Policy

- Patch releases contain compatible fixes only. Security fixes should ship on the
  lowest active patch line that can receive them safely.
- Until 1.0, minor releases may include breaking changes, but each breaking
  change must be called out in this changelog with impact and migration notes.
- Major releases are reserved for intentional compatibility resets after 1.0.
- The stable auto-update channel follows published, non-prerelease GitHub
  Releases for `v*` tags.

## [0.8.4] - 2026-07-27

Dependency maintenance release with no intentional user-facing behavior
changes.

### Changed

- Updated the desktop npm dependency group, including Dockview 7.0.4, React
  19.2.8, Playwright 1.62.0, Testing Library jest-dom 7.0.0, and the current
  formatting and linting tools (#202).
- Updated the Rust dependency group, including base64 0.23.0, serde_json
  1.0.151, Tokio 1.53.1, tokio-util 0.7.19, typeship 0.2.1, and
  sql-dialect-fmt 1.18.0 (#203).
- Updated the OpenSSF Scorecard action from 2.4.3 to 2.4.4 (#201).

## [0.8.3] - 2026-07-26

Repository maintenance only. The application is unchanged from 0.8.2 — the
packages for this tag are rebuilt from identical sources.

### Changed

- The before/after screenshots embedded in pull requests #155 and #156 now live
  in `docs/assets/pr/`. They were hosted on two branches that existed only to
  serve those images, which meant the branches could never be deleted without
  breaking the merged pull requests that linked them (#200).

## [0.8.2] - 2026-07-25

### Added

- Log buffers support marking lines in four colours. Marks are listed above the
  buffer, jump to the line when clicked, and persist per file so reopening a log
  later keeps the trail. Marks past the end of a shortened file are dropped, so
  a truncated or rotated log cannot list lines that no longer exist (#177).

### Fixed

- The BI, Explain Plan and Lakehouse panels now render in the selected
  language. All three were English-only regardless of the language setting,
  including the plan analysis views, the plan node detail table, the lakehouse
  action list, and the BI field summaries (#170).
- Remaining tooltips and screen-reader labels across the colour picker, chart
  view, result graph, ERD, editor split, metadata tool window, completion
  inspector and AI provider forms now follow the language setting (#170).
- `tools/extensions/scaffold-connector-repos.mjs --force` no longer reverts
  implemented connector drivers to the bootstrap template. It regenerates
  manifests, docs, CI and packaging as before but preserves each repo's Rust
  sources; `--force-drivers` is the explicit opt-in for overwriting them (#182).
- The connector scaffold runs again at all. Since 0.8.0 added declarative
  feature extensions, which ship no driver and therefore declare no engine, the
  generator aborted with "irodori.knowledge has no engine" — even in
  `--dry-run` (#182).

## [0.8.1] - 2026-07-25

### Fixed

- Japanese users can now operate the Schema Designer, Schema Diagram, Import,
  and Search & Replace dialogs in Japanese. All four rendered entirely in
  English regardless of the language setting, action buttons included (#133).
- Git panel errors, the outcome chip on every query-history row, background job
  kinds and statuses, theme kind suffixes, and the import, ERD export, table
  specification, knowledge pack, and passkey error messages are translated
  instead of always English (#135).
- Five JSON parsers accepted an array where they required an object — their own
  error messages said "must be an object" — and then read string keys off it,
  yielding `undefined` for every field instead of a clear failure. Affects
  table-specification import, schema-diagram import, SQL keyword and snippet
  configuration, and passkey credential parsing (#167).
- Query-history retention limits set through Settings ▸ JSON are rounded to
  whole numbers, matching what the settings UI already did. A fractional value
  previously persisted as-is (#167).
- The run menu in the SQL editor no longer opens off the left edge of the
  window when the editor pane is narrow (#172).

### Changed

- Connecting with the Hive connector now raises a warning that stays until
  dismissed: it reads Parquet files under the table root and ignores the
  metastore, so partitions stored elsewhere and ORC/Avro/text tables read as
  empty or fail to resolve. Hudi and Delta Lake were corrected upstream and no
  longer warn (#117).
- Notifications gained a warning level for outcomes that succeeded but cannot be
  trusted. Like errors, warnings stay until dismissed rather than disappearing
  after a few seconds.
- The remove buttons in the Schema Designer's column, index, and foreign-key
  rows now have accessible names (#133).

## [0.8.0] - 2026-07-22

### Added

- Declarative feature extensions can activate named, trusted workbench features
  compiled into Irodori Table without executing downloaded code.
- The public Irodori Knowledge and Irodori Datalake extensions are available in
  the marketplace on Linux, macOS, and Windows for x86_64 and Arm64.

### Changed

- Knowledge and Lakehouse/Datalake panels and commands are available only while
  their matching extension is installed and enabled. Install them from
  **Settings ▸ Extensions**; disabling or uninstalling one removes its UI
  immediately. Existing native connector extensions remain compatible.

### Security

- Declarative packages use the same pinned-release download, SHA-256 integrity,
  exact-permission, safe-path, and manifest validation as native extensions.

## [0.7.47] - 2026-07-21

### Changed

- The connection manager moves bulk deletion into row context menus, removes
  the redundant Disconnect and Profile ID controls, and simplifies export
  password notices.
- The Lakehouse sidebar entry stays hidden until its datalake workflows are
  production-ready.

### Fixed

- The workbench dock divider now uses the light Irodori theme instead of the
  dark Dockview fallback.
- Deleting the final saved connection leaves the list empty instead of
  recreating a placeholder profile.
- Knowledge pack update timestamps render as local calendar dates.

## [0.7.46] - 2026-07-20

### Added

- Log files gain level and text filtering: pick a minimum severity and/or type
  a pattern, and non-matching entries fold away without touching the document.
  Stack-trace lines follow their parent entry, so a filtered ERROR keeps its
  trace. Filters are per-tab and reset when the tab changes language.
- The Iceberg connection form exposes the OAuth2 catalog fields
  (server URI, client ID, scope); the client secret travels in the
  session-only credential field and is never persisted in options.

### Fixed

- Opening the terminal without the desktop runtime no longer crashes the whole
  workbench; it shows a clear notice instead, and the panel is isolated behind
  an error boundary.
- A panic during an AI chat no longer permanently breaks every subsequent chat
  command, and cancelling a chat during such a failure actually cancels the
  running query instead of silently doing nothing.
- The extension installer honours a catalog entry's manifest path and rejects
  unsupported install kinds up front instead of mishandling them as GitHub
  releases.
- BigQuery and Bigtable share one GCP token implementation instead of two
  divergent copies.

## [0.7.45] - 2026-07-20

### Changed

- Dependency updates: the Rust group (8 crates), the desktop npm group
  (6 packages), and the GitHub Actions group (2 actions).

### Added

- Regression tests pinning the Japanese settings translations — the
  repository's first external contribution (thanks @MFA-G, #151).

## [0.7.44] - 2026-07-20

### Added

- CSV, TSV, and log files are syntax-highlighted in the editor: rainbow
  columns with a distinct header row for delimited files (quote-aware, so
  embedded delimiters parse correctly), and severity/timestamp/section
  highlighting for logs, all in theme colours. Non-SQL buffers drop SQL
  completion, linting, and formatting.
- Import can append to an existing table instead of always creating a new one.
- The extension marketplace hides entries that cannot be installed on the
  current platform, with a note to reveal them.

### Fixed

- Terminal tabs are reachable by keyboard and announced as real tabs; the
  panel's strings are translated.
- External links in settings open through the system opener, so they work in
  the packaged app.
- The AI settings no longer render glued text ("withclaude / codexfrom a
  terminal"), and the local-model install hint only shows for providers that
  install local models.
- Dates and numbers follow the app language in the remaining places that used
  the OS locale.
- The stale "held in memory only" description of AI provider keys now says
  they are saved to the OS keychain, matching what the app does.
- Internal cleanup: dead menu config and unreachable strings removed, platform
  detection modernised, duplicated primitives consolidated.

## [0.7.43] - 2026-07-19

### Fixed

- The schema diagram's "Create DB SQL" emits indexes again; they were silently
  dropped from the generated script while the equivalent table-spec path kept
  them.
- Local branches containing a slash (feature/login) are no longer classified as
  remote: they stay visible with "Show remote branches" unchecked, filter as
  branches, and lose the remote badge styling.
- The primary-key checkbox in the schema designer's Alter mode is disabled with
  an explanation instead of silently doing nothing.
- Commit dates in the Git graph and query history show the year for entries
  from previous years, and follow the app language instead of the OS locale.
- CSV import keeps leading zeros: zero-padded values such as postal codes are
  typed as text instead of being coerced to integers.

### Accessibility

- The settings JSON editor, snippet import box, connection search, Git branch
  controls, and both connection-form toggles have real accessible names; the
  editor tab list no longer announces the new-tab and menu buttons as tabs.
- The connection dialog's Delete button is disabled when there is nothing to
  delete, and a first run shows "No saved connections yet" instead of "No
  matching connections".

## [0.7.42] - 2026-07-19

### Fixed

- Replace All no longer corrupts documents: an out-of-range `$n` group
  reference spliced the entire buffer into every match, across every open tab.
- Backend errors show their real message instead of `[object Object]` —
  extension installs, plan explanations, row-detail queries, migration studio,
  snippets import, security settings, schema diagram, and knowledge refresh
  were all affected.
- Query history records again on fresh profiles, and the result memory budget
  starts at its intended 10,000 rows instead of 1,000. Both were the same
  absent-key-read-as-zero defect, now fixed once in a shared parser.
- Primary buttons are readable in every dark theme; contrast was as low as
  1.5:1. The light default's line-number gutter also now meets WCAG AA.
- The Run options menu, the editor tab "..." menu, and the Lakehouse context
  menu render on screen; each was clipped or displaced by a dock container.
- Copy as Excel copies the HTML table instead of an empty string.
- Closing one sidebar no longer resizes the other or loses its stored width.
- The Git panel loads when opened from the sidebar tab, and its repository
  path controls stay visible when no repository has resolved.
- The Structure view renders its separators instead of literal `\u00b7` text.
- The editor context menu is translated (15 of 16 items stayed English).

### Changed

- New default themes, Irodori Bloom and Bloom Paper, built from the app icon's
  palette with a real accent hue and verified WCAG AA contrast.
- One typographic scale anchored on the menu bar size; 182 hardcoded font
  sizes migrated to tokens.
- Sidebar view tabs default to icons only on a single row; text labels are a
  new setting under Settings > General.
- The transport toggle renders as a proper segmented control with a visible
  active state.
- Editor tabs keep a readable minimum width and scroll instead of shrinking to
  one character; the new-tab and tab-actions buttons gained separation and a
  larger hit target.
- The settings dialog is wider, and narrowed sidebars collapse to a compact
  state instead of hiding their content.

### Added

- Lakehouse connections are configured in the connection form: catalog,
  warehouse, region, and credential fields per engine.
- View tabs can be dragged between the left and right sidebars.
- SQL snippets are searchable and taggable, and collapse to summaries.
- Keyboard shortcuts are visibly editable in the keymap settings.
- Settings > General > Reset layout restores the default panel arrangement.
- A user guide in docs/ covering every feature area, with a lakehouse
  zero-to-connection walkthrough and Git panel setup.
- Japanese translations for the connection form (86 field labels) and other
  previously untranslated surfaces.

## [0.7.41] - 2026-07-19

### Fixed

- Release infrastructure only; the application is unchanged from 0.7.40. The
  cache-warming workflow failed on Windows on every run since it was added, so
  Windows release builds recompiled their dependencies from cold each time and
  a partial cache entry kept the correct one from ever being saved.

## [0.7.40] - 2026-07-19

### Changed

- TLS now runs on a single crypto backend. The desktop build previously
  compiled both `aws-lc-rs` and `ring`; it now uses `ring` alone, which the
  updater already required. Certificate verification is unchanged and still
  uses the operating system trust store. Connections lose the post-quantum
  hybrid X25519MLKEM768 key exchange and fall back to classical key exchange.
- Foundation crates move to irodori-kit v0.7.0, which also carries the 0BSD
  license metadata repair, cross-platform extension release automation, and the
  Windows extension packaging fix.

### Added

- A Nix dev shell (`flake.nix`) pinning the exact Rust from
  `rust-toolchain.toml`, Node 24, mold, and the Linux desktop libraries, so a
  local checkout gets the same toolchain CI uses.

## [0.7.39] - 2026-07-18

### Changed

- Stable releases no longer require platform signing credentials. Each signing
  lane detects its own secrets and turns itself off when they are absent, so a
  stable release publishes the full Linux, universal macOS, and Windows set —
  unsigned — instead of failing the dispatch. Release notes state which
  artifacts are unsigned, and unsigned macOS and Windows packages may trigger
  Gatekeeper and SmartScreen warnings.
- Updater artifacts are no longer exclusive to fully signed builds. They are
  published whenever the updater signing keys are configured, independent of
  Apple and Windows code signing, so the stable auto-update channel works for
  unsigned releases. Releases without updater keys omit `latest.json` and must
  be upgraded by reinstalling.

## [0.7.38] - 2026-07-18

### Changed

- The sidebar object browser names lakehouse containers per each engine's
  source-type contract: namespaces for DuckDB, MotherDuck, Iceberg, S3 Tables,
  Delta Lake, and Hudi; databases for Hive and Athena. Lakehouse containers
  render a dedicated icon distinct from schema folders.

## [0.7.37] - 2026-07-14

### Fixed

- Unsigned desktop builds no longer register the updater plugin without its
  signed-release configuration, preventing an updater configuration panic from
  aborting startup.

### Changed

- Lightweight releases now publish Linux AppImage, deb, and rpm packages. The
  preview channel appends unsigned universal macOS app/dmg packages and
  supports SignPath-signed Windows NSIS/MSI installers for a complete
  pre-release asset set.

## [0.7.34] - 2026-07-08

### Fixed

- Updated `crossbeam-epoch` to 0.9.20 for the RustSec advisory fix.
- Updated GitHub Actions cache usage to the current major across CI, security,
  and release workflows.

## [0.7.33] - 2026-07-06

### Changed

- Updated the desktop npm dependency group and Rust dependency group from
  Dependabot. (#77, #78)

## [0.7.32] - 2026-07-06

### Fixed

- Sidebars keep their configured widths (explorer 200px, inspector 300px by
  default) when the dock layout is first built or a sidebar is opened;
  dockview's proportional redistribution stretched the explorer to ~465px on
  a 1440px window. (#74)

## [0.7.31] - 2026-07-06

### Fixed

- The results header wraps inside a narrowed pane instead of overflowing:
  result-set tabs and actions were sliced at the sidebar boundary, which read
  as the sidebar overlaying the results. (#72)

## [0.7.30] - 2026-07-06

### Changed

- Row Detail moved out of the results pane into a full-height right sidebar
  view (VS Code-style): selecting a row or cell opens it, the sidebar view
  switcher can bring it back, and closing it clears the row selection. (#68)
- The Save button is removed from the editor run toolbar; saving stays on
  File → Save and its keyboard shortcut, keeping the bottom dock focused on
  format/run actions. (#70)

## [0.7.29] - 2026-07-06

### Changed

- Stable release dispatch now gates on updater, Windows signing, and macOS
  signing/notarization secrets before publishing signed Windows artifacts,
  signed/notarized macOS artifacts, and stable updater manifests.
- Editor Save/Run toolbar is docked at the bottom-right of the editor pane,
  with the run-options dropdown opening upward (TablePlus-style). (#64)
- Saved connections moved from the explorer panel strip to a dedicated
  far-left connections rail with engine icons and color tags (TablePlus-style).
  (#65)
- Left/right sidebars span the full workspace height; the saved dockview
  layout key is bumped to v2 so existing installs pick up the new arrangement
  (VS Code-style). (#66)
- Editor tabs use the WAI-ARIA tablist pattern and gain hover close buttons,
  middle-click close, and a visible tab-actions menu. (#62)
- Menubar supports WAI-ARIA APG keyboard navigation. (#55)

### Fixed

- Body-portaled popovers (menubar menus, context menus) rendered fully
  transparent; theme variables are now mirrored onto `:root`. (#52)
- Escape closed every stacked dialog at once; it now closes only the topmost.
  (#53)
- Settings dialog lacked initial focus, a focus trap, and `aria-modal`. (#54)
- Unsaved SQL tab content was silently lost on quit/reload; editor tabs are
  now persisted. (#56)
- Discard wiped staged grid edits without confirmation, and the delete-rows
  confirm button was mislabeled "Commit". (#57)
- Large UI surfaces (Connection Manager, ERD, About, run controls, query
  parameters, sidebar, titlebar/statusbar, results summary) bypassed i18n and
  showed English under the Japanese locale; 141 keys added to both locales.
  (#58)
- Every "接続を追加" click persisted a fresh "Connection N" draft; pristine
  drafts are now reused and discarded on close, and the SQLite sample profile
  is only persisted after a successful connection. (#59)
- Toast stack covered dialog action buttons (Connect/Test/Save in the
  Connection Manager). (#60)
- ERD showed "no tables match" while metadata was still loading, and
  lazy-loaded dialogs opened with no feedback. (#61)
- Result-mode control state was not announced to assistive technology, and
  the About copy-path button failed silently and could get stuck. (#63)

## [0.7.6] - 2026-07-04

### Changed

- DuckDB and MotherDuck now ship through installable connector extensions; the
  desktop crate no longer carries embedded libduckdb or a `duckdb` Cargo
  feature.

## [0.7.5] - 2026-07-04

### Changed

- Lightweight Linux releases now skip duplicate release-job typegen checks and
  publish an AppImage-only artifact so the fast lane spends less time compiling
  and packaging.

## [0.7.4] - 2026-07-04

### Changed

- Lightweight Linux releases now build default features only, leaving DuckDB and
  legacy connector bundles out of the fast release lane.

## [0.7.3] - 2026-07-04

### Changed

- The tag release workflow now publishes a lightweight Linux pre-release without
  macOS, Windows, or updater signing so releases can proceed while signing
  secrets are being provisioned.

## [0.7.2] - 2026-07-04

### Fixed

- Migration Studio now delegates plan generation to `irodori-migration` 0.4
  through a typed Tauri command, removing the incompatible TypeScript BLAKE3
  planner and using the crate's cross-engine MD5 row-hash contract.
- The migration planner boundary now has generated TypeScript bindings, native
  regression tests, and UI bridge tests for the desktop command contract.

## [0.7.1] - 2026-07-02

### Fixed

- Release builds now pass `--features legacy-connectors,duckdb` so packaged
  binaries include the built-in connectors documented as shipped.
- The release dry-run workflow uses the same connector feature set as the
  release workflow.
- Feature-gated connector errors now point users toward release builds or
  marketplace connectors instead of only telling developers to rebuild locally.

### Changed

- TypeScript binding generation dependencies were updated to `typeship` 0.2.0.

## [0.7.0] - 2026-07-02

### Added

- Native connector extension framework groundwork, connector repository
  scaffolding updates, and extension scenario/fleet tooling.
- Release hardening for public desktop distribution: Windows code signing,
  macOS signing/notarization preparation, signed Tauri updater artifacts, and
  stable-channel `latest.json` publication.
- Knowledge ML cheatsheet extraction hardening and developer doctor checks for
  release/environment readiness.

### Changed

- Desktop app structure was reorganized around controller hooks and clearer
  workbench boundaries.
- Release documentation now records signing secrets, notarization setup,
  updater channel policy, and breaking-change policy.
- Connector catalog and support snapshots were aligned with the managed
  extension distribution model.

### Removed

- Legacy generic `objectStore` and `kvStore` engine exposure was removed from
  the root catalog and app-consumed docs/snapshots.

## [0.6.0] - 2026-07-02

### Added

- First-run onboarding: the empty object browser now offers "Open SQLite
  sample" (creates an in-memory sample database with demo tables) and
  "Add a connection"; a connected-but-empty database offers "Create a table"
  and "Import from file".
- Retry button on connection and query error notifications when the backend
  classifies the error as retryable.
- Notifications now stack (up to 4) instead of overwriting each other;
  error notifications stay until dismissed.
- Command palette: arrow-key navigation, focus trap, and combobox ARIA.
- Object browser tree: keyboard navigation (Up/Down/Left/Right/Home/End).
- About dialog links to documentation, GitHub, and the issue tracker.
- Notification, sidebar, and onboarding strings are localized (English and
  Japanese).

- Clicking a line number selects that line (Shift+click extends), plus a
  Mod+L select-line shortcut.
- Editor accuracy and performance regression suite (e2e): exact-text edit
  scenarios plus 5,000-line load/typing/scroll benchmarks with a gutter
  alignment check.

### Fixed

- Desktop exports (results, ERD SVG/PNG, table specs, connection profiles,
  SQL tabs, schema diagrams) use the native Save As dialog instead of a
  browser download, which exposed the dev-server address in the WebKitGTK
  download banner.
- The editor re-measures font metrics on UI zoom changes and after async
  font loads, and the code font is integer-px — the caret no longer drifts
  off the character it edits.
- Editor gutter pins the content font metrics so line numbers stay aligned
  with their lines in the WebKitGTK webview.

### Changed

- All destructive-action confirmations use the styled confirm dialog
  (git operations, history bulk delete, local AI model delete, reload guard)
  instead of native `window.confirm`.
- Committing grid edits that include row deletions now asks for a final
  confirmation.
- SECURITY.md documents GitHub private vulnerability reporting as the
  disclosure channel.

## [0.5.0] - 2026-07-01

- Foundation crates extracted to the sibling repo
  [irodori-kit](https://github.com/hjosugi/irodori-kit) (consumed via git
  tags); this repository is app-only.
- Packaging templates moved to irodori-kit.
- Bundled sample connections and the seeded demo workspace were removed;
  a fresh install starts with an empty workspace.

[0.7.33]: https://github.com/hjosugi/irodori-table/compare/v0.7.32...v0.7.33
[0.7.6]: https://github.com/hjosugi/irodori-table/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/hjosugi/irodori-table/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/hjosugi/irodori-table/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/hjosugi/irodori-table/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/hjosugi/irodori-table/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/hjosugi/irodori-table/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/hjosugi/irodori-table/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/hjosugi/irodori-table/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/hjosugi/irodori-table/releases/tag/v0.5.0
