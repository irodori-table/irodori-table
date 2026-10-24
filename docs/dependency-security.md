# Dependency security mitigations

The GTK3 dependency chain fixes `glib` to the 0.18 line. The reviewed local copy
contains gtk-rs/gtk-rs-core#1343, which repairs the mutable FFI output pointer
in `VariantStrIter` (RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g).
The package version stays 0.18.5 so version-based scanners still report it.
No advisory ignore is added. See `vendor/glib-0.18.5-patched/PROVENANCE.md`
for upstream source, license, registry checksum and the patched file digest.

Verify the source with:

```bash
sha256sum vendor/glib-0.18.5-patched/src/variant_iter.rs
```

Expected SHA-256: `a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc`.

Remove this patch when the GTK3 dependency chain can use the fixed upstream release.

The updater retains Rustls TLS and signature verification. The release workflow produces direct `.exe` and `.msi` installers. Disabling the unused legacy Windows ZIP feature removes its affected extraction dependency.
