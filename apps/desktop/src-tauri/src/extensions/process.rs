//! Out-of-process connector probing.
//!
//! Connectors build with `panic = "abort"` and the ABI has no `catch_unwind`,
//! so a driver panic or segfault while the host loads a freshly downloaded
//! library aborts the whole application. Probing through the
//! `irodori-connector-host` sidecar runs that code in a child process instead:
//! a crash there is reported as a failed install, not a dead app.
//!
//! The connection path still loads in-process for now; moving it here is the
//! next step (see `ConnectorProcess` below, ready for it).

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

use super::abi::{probe_library, NativeConnectorProbe};

/// Probe a connector, preferring the sidecar and falling back to in-process
/// loading when the sidecar binary is not next to the app (unit tests, or a
/// build that did not bundle it).
pub(crate) fn probe_connector(path: &Path) -> Result<NativeConnectorProbe, String> {
    match connector_host_binary() {
        Ok(host) => probe_via_process(&host, path),
        Err(_) => probe_library(path),
    }
}

fn probe_via_process(host: &Path, library: &Path) -> Result<NativeConnectorProbe, String> {
    let output = Command::new(host)
        .arg("--probe")
        .arg(library)
        .output()
        .map_err(|error| format!("failed to run connector host: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(if stderr.trim().is_empty() {
            "connector host probe failed".to_string()
        } else {
            stderr.trim().to_string()
        });
    }
    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("connector probe returned invalid JSON: {error}"))?;
    Ok(NativeConnectorProbe {
        engine: value
            .get("engine")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        manifest_json: value
            .get("manifestJson")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        config_json: value
            .get("configJson")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        health: value.get("health").cloned().unwrap_or(Value::Null),
        describe: value.get("describe").cloned().unwrap_or(Value::Null),
    })
}

/// The sidecar sits next to the running executable (Tauri `externalBin`).
fn connector_host_binary() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("cannot locate current executable: {error}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "current executable has no directory".to_string())?;
    let name = if cfg!(windows) {
        "irodori-connector-host.exe"
    } else {
        "irodori-connector-host"
    };
    let candidate = dir.join(name);
    if candidate.is_file() {
        return Ok(candidate);
    }
    Err(format!(
        "connector host binary not found at {}",
        candidate.display()
    ))
}
