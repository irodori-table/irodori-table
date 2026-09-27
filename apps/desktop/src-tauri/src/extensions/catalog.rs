//! Backend-resolved extension catalog.
//!
//! The webview used to choose the repository, asset, tag, and sha256 the
//! installer acted on, so a single XSS could ask the host to download and load
//! native code from any repository. The install command now takes only an `id`
//! and a `version`; this module fetches the catalog, optionally verifies its
//! minisign signature, and resolves the exact release asset for the running
//! target. The installer's trusted-owner allowlist still applies on top.

use std::collections::BTreeMap;

use irodori_error::{IrodoriError, Result as IrodoriResult};
use serde::Deserialize;

use super::{store, ExtensionInstallKind, ExtensionInstallRequest};

pub(crate) const CATALOG_URL: &str =
    "https://raw.githubusercontent.com/irodori-table/irodori-table/main/registry/catalog/index.json";

/// Minisign public key for the catalog.
///
/// Provision once with `minisign -G`; the secret key lives in the
/// `CATALOG_SIGNING_KEY` Actions secret and signs the catalog in
/// `extension-catalog-sync.yml`. While this is empty the signature is not
/// checked — the installer's trusted-owner allowlist still applies — and the
/// gap is reported at startup.
pub(crate) const CATALOG_PUBLIC_KEY: &str = "";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Catalog {
    #[serde(default)]
    extensions: Vec<CatalogExtension>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogExtension {
    id: String,
    version: String,
    repository: String,
    #[serde(default)]
    permissions: Vec<String>,
    install: CatalogInstall,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogInstall {
    #[serde(default)]
    kind: ExtensionInstallKind,
    tag: String,
    #[serde(default)]
    manifest_path: Option<String>,
    #[serde(default)]
    assets: BTreeMap<String, CatalogAsset>,
}

#[derive(Debug, Deserialize)]
struct CatalogAsset {
    name: String,
    sha256: String,
}

impl Catalog {
    /// Resolve the install request for `id@version` on `target` from the
    /// catalog alone. The webview supplies none of these fields.
    pub(crate) fn install_request(
        &self,
        id: &str,
        version: &str,
        target: &str,
    ) -> IrodoriResult<ExtensionInstallRequest> {
        let entry = self
            .extensions
            .iter()
            .find(|entry| entry.id == id && entry.version == version)
            .ok_or_else(|| {
                IrodoriError::validation(format!("{id}@{version} is not in the extension catalog"))
            })?;
        store::ensure_trusted_owner(&entry.repository)?;
        let asset = entry.install.assets.get(target).ok_or_else(|| {
            IrodoriError::validation(format!("no {id}@{version} asset for target {target}"))
        })?;
        Ok(ExtensionInstallRequest {
            id: entry.id.clone(),
            version: entry.version.clone(),
            kind: entry.install.kind,
            repository: entry.repository.clone(),
            asset_name: asset.name.clone(),
            tag: entry.install.tag.clone(),
            sha256: asset.sha256.clone(),
            permissions: entry.permissions.clone(),
            manifest_path: entry.install.manifest_path.clone(),
        })
    }
}

/// Fetch the catalog and, when a public key is configured, verify its minisign
/// signature over the raw bytes before parsing any JSON.
pub(crate) async fn fetch_verified() -> IrodoriResult<Catalog> {
    let body = http_get(CATALOG_URL).await?;
    if !CATALOG_PUBLIC_KEY.trim().is_empty() {
        let signature = http_get(&format!("{CATALOG_URL}.minisig")).await?;
        verify_signature(&body, &signature)?;
    }
    serde_json::from_slice(&body)
        .map_err(|error| IrodoriError::validation(format!("invalid extension catalog: {error}")))
}

async fn http_get(url: &str) -> IrodoriResult<Vec<u8>> {
    let response = reqwest::get(url).await.map_err(|error| {
        IrodoriError::transport(format!("failed to fetch extension catalog: {error}"))
    })?;
    if !response.status().is_success() {
        return Err(IrodoriError::transport(format!(
            "failed to fetch extension catalog: HTTP {} ({url})",
            response.status()
        )));
    }
    Ok(response
        .bytes()
        .await
        .map_err(|error| {
            IrodoriError::transport(format!("failed to read extension catalog: {error}"))
        })?
        .to_vec())
}

fn verify_signature(body: &[u8], signature_text: &[u8]) -> IrodoriResult<()> {
    use minisign_verify::{PublicKey, Signature};

    let key = PublicKey::from_base64(CATALOG_PUBLIC_KEY).map_err(|error| {
        IrodoriError::validation(format!("invalid catalog public key: {error}"))
    })?;
    let signature_text = std::str::from_utf8(signature_text)
        .map_err(|_| IrodoriError::validation("catalog signature is not UTF-8"))?;
    let signature = Signature::decode(signature_text)
        .map_err(|error| IrodoriError::validation(format!("invalid catalog signature: {error}")))?;
    key.verify(body, &signature, false)
        .map_err(|_| IrodoriError::validation("extension catalog signature check failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog() -> Catalog {
        serde_json::from_str(
            r#"{
              "schemaVersion": 1,
              "extensions": [
                {
                  "id": "irodori.redis",
                  "version": "0.1.6",
                  "repository": "https://github.com/irodori-table/irodori-extension-redis",
                  "permissions": ["native"],
                  "install": {
                    "kind": "githubRelease",
                    "tag": "v0.1.6",
                    "manifestPath": "irodori.extension.json",
                    "assets": {
                      "x86_64-linux": {
                        "name": "irodori-extension-redis-x86_64-linux.tar.gz",
                        "sha256": "sha256:aa"
                      }
                    }
                  }
                },
                {
                  "id": "irodori.evil",
                  "version": "1.0.0",
                  "repository": "https://github.com/attacker/irodori-extension-evil",
                  "permissions": [],
                  "install": {
                    "kind": "githubRelease",
                    "tag": "v1.0.0",
                    "assets": {
                      "x86_64-linux": {"name": "evil.tar.gz", "sha256": "sha256:bb"}
                    }
                  }
                }
              ]
            }"#,
        )
        .expect("parse catalog")
    }

    #[test]
    fn resolves_every_install_field_from_the_catalog() {
        let request = catalog()
            .install_request("irodori.redis", "0.1.6", "x86_64-linux")
            .expect("resolve");
        assert_eq!(
            request.repository,
            "https://github.com/irodori-table/irodori-extension-redis"
        );
        assert_eq!(
            request.asset_name,
            "irodori-extension-redis-x86_64-linux.tar.gz"
        );
        assert_eq!(request.tag, "v0.1.6");
        assert_eq!(request.sha256, "sha256:aa");
        assert_eq!(request.permissions, vec!["native"]);
    }

    #[test]
    fn rejects_an_id_or_version_not_in_the_catalog() {
        assert!(catalog()
            .install_request("irodori.nope", "0.1.6", "x86_64-linux")
            .is_err());
        assert!(catalog()
            .install_request("irodori.redis", "9.9.9", "x86_64-linux")
            .is_err());
    }

    #[test]
    fn rejects_an_untrusted_publisher() {
        let error = catalog()
            .install_request("irodori.evil", "1.0.0", "x86_64-linux")
            .unwrap_err();
        assert!(
            error.message.contains("trusted publisher"),
            "{}",
            error.message
        );
    }

    #[test]
    fn rejects_a_target_with_no_asset() {
        assert!(catalog()
            .install_request("irodori.redis", "0.1.6", "aarch64-windows")
            .is_err());
    }

    #[test]
    fn an_unconfigured_key_fails_closed() {
        // CATALOG_PUBLIC_KEY is empty until provisioned, so any verification
        // attempt must fail rather than silently accept.
        assert!(verify_signature(b"catalog", b"signature").is_err());
    }
}
