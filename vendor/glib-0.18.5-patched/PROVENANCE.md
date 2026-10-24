# Patched glib 0.18.5 provenance

This directory is the published `glib` 0.18.5 crate from crates.io, whose
registry checksum is:

`233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`

It is temporarily vendored because Tauri's GTK3 dependency chain requires the
0.18 release line, while the first release identified as fixed for
RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g is glib 0.20.0.

The only upstream source change is the fix from
gtk-rs/gtk-rs-core#1343 (upstream commit
`05dff0ee696f9bcd8617cd48c4b812d046d440cb`):

- make the `VariantStrIter::impl_get` output pointer mutable;
- pass `&mut p` to `g_variant_get_child` instead of `&p`.

The patched `src/variant_iter.rs` SHA-256 is
`a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc`;
Verify this digest before auditing or replacing the vendored source.

The added `PROVENANCE.md` file is downstream documentation and is not part of
the original crate.

Owner: irodori-table/irodori-table maintainers.

Retire this copy as soon as Tauri's Linux stack resolves to glib 0.20.0 or
later. If that has not happened, re-review this exception by 2026-10-31.
