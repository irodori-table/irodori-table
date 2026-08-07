//! Headless installer for catalog extensions.
//!
//! `ext_install` is a Tauri command with no CLI path, so this test drives it
//! directly — the same code the Extensions settings tab calls, which means the
//! sha256 check, the ABI probe and the `installed.json` write all happen exactly
//! as they would through the UI.
//!
//! It reads `registry/catalog/index.json` and installs the ids named in
//! `IRODORI_INSTALL_IDS` (comma separated), resolving version, repository, tag,
//! asset name and digest from the catalog entry for the current target.
//!
//!     IRODORI_INSTALL_IDS=irodori.duckdb,irodori.qdrant \
//!       cargo test --test install_catalog_extensions -- --ignored --nocapture
//!
//! This writes to the real app data directory. Set XDG_DATA_HOME to install
//! somewhere else.
use std::path::PathBuf;

use desktop_lib::extensions::{self, ExtensionInstallKind, ExtensionInstallRequest};
use serde_json::Value;
use tauri::Manager;

fn catalog_path() -> PathBuf {
    // tests/ -> src-tauri/ -> desktop/ -> apps/ -> repo root
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("registry/catalog/index.json")
}

/// Build an install request from a catalog entry, for the target we are on.
fn request_for(catalog: &Value, id: &str, target: &str) -> ExtensionInstallRequest {
    let entry = catalog["extensions"]
        .as_array()
        .expect("catalog.extensions is an array")
        .iter()
        .find(|e| e["id"].as_str() == Some(id))
        .unwrap_or_else(|| panic!("{id} is not in registry/catalog/index.json"));

    let install = &entry["install"];
    assert_eq!(
        install["kind"].as_str(),
        Some("githubRelease"),
        "{id}: only githubRelease installs are supported"
    );

    let asset = &install["assets"][target];
    assert!(
        !asset.is_null(),
        "{id}: catalog has no asset for target {target}"
    );

    // `repository` is a full URL in the catalog; the installer wants owner/repo.
    let repository = entry["repository"]
        .as_str()
        .expect("repository")
        .trim_end_matches('/')
        .rsplit("github.com/")
        .next()
        .expect("owner/repo")
        .to_string();

    ExtensionInstallRequest {
        id: id.to_string(),
        version: entry["version"].as_str().expect("version").to_string(),
        kind: ExtensionInstallKind::GithubRelease,
        repository,
        asset_name: asset["name"].as_str().expect("asset name").to_string(),
        tag: install["tag"].as_str().expect("tag").to_string(),
        sha256: asset["sha256"].as_str().expect("sha256").to_string(),
        permissions: entry["permissions"]
            .as_array()
            .map(|p| {
                p.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        manifest_path: install["manifestPath"].as_str().map(str::to_string),
    }
}

#[tokio::test]
#[ignore = "downloads real extension releases and writes to the app data dir"]
async fn install_ids_from_env() {
    let ids = std::env::var("IRODORI_INSTALL_IDS")
        .expect("set IRODORI_INSTALL_IDS to a comma-separated list of extension ids");
    let ids: Vec<&str> = ids.split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
    assert!(!ids.is_empty(), "IRODORI_INSTALL_IDS is empty");

    let _ = rustls::crypto::ring::default_provider().install_default();
    let catalog: Value = serde_json::from_slice(
        &std::fs::read(catalog_path()).expect("read registry/catalog/index.json"),
    )
    .expect("parse catalog");

    let app = tauri::Builder::default()
        .any_thread()
        .manage(extensions::ExtensionsState::default())
        .build(tauri::generate_context!())
        .expect("build tauri test app");
    let handle = app.handle().clone();
    let state = app.state::<extensions::ExtensionsState>();

    let target = extensions::ext_target();
    println!("target: {target}");

    let mut failures = Vec::new();
    for id in &ids {
        let request = request_for(&catalog, id, &target);
        let version = request.version.clone();
        print!("installing {id} {version} ... ");
        match extensions::ext_install(handle.clone(), state.clone(), request).await {
            Ok(installed) => println!(
                "ok (runtime={}, engine={:?}, abi={:?})",
                installed.runtime, installed.engine, installed.abi_version
            ),
            Err(err) => {
                println!("FAILED: {err}");
                failures.push(format!("{id}: {err}"));
            }
        }
    }

    let listed = extensions::ext_list(handle.clone(), state.clone())
        .await
        .expect("list installed");
    println!("\ninstalled.json now holds {} extensions:", listed.len());
    for e in &listed {
        println!("  {:<28} {:<8} {:<12} enabled={}", e.id, e.version, e.runtime, e.enabled);
    }

    assert!(failures.is_empty(), "install failures:\n{}", failures.join("\n"));
}
