## Summary

-

## Verification

-

## Local Environment Checklist

- [ ] `task doctor` passes, or the remaining warnings are explained below.
- [ ] `task kit-patch-check` passes if `irodori-kit` was used locally.
- [ ] Formatting/linting ran when JS/TS/Rust files changed:
      `task desktop-format-check`, `task desktop-lint`, or
      `cargo fmt --all -- --check` as appropriate.

## Clean-Room And Licensing Checklist

- [ ] I read and followed the
      [clean-room rules](https://irodori-table.github.io/irodori-docs/clean-room.html).
- [ ] This change is written from Irodori requirements, public specifications,
      vendor documentation, or license-compatible OSS with required attribution.
- [ ] I did not copy proprietary, commercial-only, GPL/AGPL, source-available,
      or unclear-license code, assets, strings, snippets, icons, theme files, or
      exact UI expression into the permissive core.
- [ ] Public references that influenced behavior are linked in the PR.
- [ ] OSS code-level references, if any, are linked with their license and
      adaptation boundary.
- [ ] Any new dependency, asset, grammar, driver, sample, or template follows
      the [license policy](https://irodori-table.github.io/irodori-docs/licensing.html).
- [ ] Any dependency, build, CI, release, extension, or credential-handling
      change follows
      [development security](https://irodori-table.github.io/irodori-docs/development-security.html).
- [ ] I did not introduce plaintext secret persistence, unredacted credential
      logging, or broad background file writes.
- [ ] Any new Rust crate declares `license = "MIT OR 0BSD"` or
      `license.workspace = true`.
- [ ] Tests assert Irodori behavior rather than another product's private
      behavior.
