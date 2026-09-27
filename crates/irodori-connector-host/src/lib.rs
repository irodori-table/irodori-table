//! Irodori connector C-ABI loader.
//!
//! Native connector extensions are cdylibs exporting six `#[no_mangle]`
//! functions. This crate loads one, reads its engine/manifest/config, and
//! calls it with JSON in / JSON out. It is used two ways:
//!
//! - **In-process** by the desktop host (`NativeConnector`, `probe_library`).
//! - **Out-of-process** by the `irodori-connector-host` binary, which speaks
//!   one JSON request per line on stdin/stdout. Running the connector in its
//!   own process is what keeps a driver panic or segfault — connectors build
//!   with `panic = "abort"`, so the host cannot catch it — from taking the
//!   whole application down.

use std::io::{BufRead, Write};
use std::path::Path;

use libloading::Library;
use serde_json::{json, Value};

pub const ABI_VERSION: u32 = 1;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct IrodoriConnectorBuffer {
    pub ptr: *const u8,
    pub len: usize,
}

type AbiVersionFn = unsafe extern "C" fn() -> u32;
type BufferFn = unsafe extern "C" fn() -> IrodoriConnectorBuffer;
type CallJsonFn = unsafe extern "C" fn(IrodoriConnectorBuffer) -> IrodoriConnectorBuffer;
type FreeBufferFn = unsafe extern "C" fn(IrodoriConnectorBuffer);

#[derive(Debug, Clone)]
pub struct NativeConnectorProbe {
    pub engine: String,
    pub manifest_json: String,
    pub config_json: String,
    pub health: Value,
    pub describe: Value,
}

pub struct NativeConnector {
    _library: Library,
    engine: String,
    call_json: CallJsonFn,
    free_buffer: FreeBufferFn,
}

/// Explain a failed `dlopen` in terms the user can act on.
///
/// The prebuilt Linux connectors link a recent glibc, so on an older
/// distribution `dlopen` fails with a bare `version 'GLIBC_2.xx' not found`
/// that reads like a corrupt file rather than a distribution mismatch.
fn load_error(context: &str, error: impl std::fmt::Display) -> String {
    let message = error.to_string();
    #[cfg(all(unix, not(target_os = "macos")))]
    if message.contains("GLIBC_") && message.contains("not found") {
        return format!(
            "{context}: {message}. This connector was built against a newer glibc than this system provides; use a connector build for your distribution."
        );
    }
    format!("{context}: {message}")
}

impl NativeConnector {
    pub fn load(path: &Path) -> Result<Self, String> {
        let library = unsafe { Library::new(path) }
            .map_err(|error| load_error("failed to load native connector library", error))?;
        unsafe { Self::from_library(library) }
    }

    unsafe fn from_library(library: Library) -> Result<Self, String> {
        let abi_version = *library
            .get::<AbiVersionFn>(b"irodori_extension_abi_version\0")
            .map_err(|error| {
                format!("connector is missing irodori_extension_abi_version: {error}")
            })?;
        let engine_json = *library
            .get::<BufferFn>(b"irodori_connector_engine_json\0")
            .map_err(|error| {
                format!("connector is missing irodori_connector_engine_json: {error}")
            })?;
        let call_json = *library
            .get::<CallJsonFn>(b"irodori_connector_call_json\0")
            .map_err(|error| {
                format!("connector is missing irodori_connector_call_json: {error}")
            })?;
        let free_buffer = *library
            .get::<FreeBufferFn>(b"irodori_connector_free_buffer\0")
            .map_err(|error| {
                format!("connector is missing irodori_connector_free_buffer: {error}")
            })?;

        let version = abi_version();
        if version != ABI_VERSION {
            return Err(format!(
                "unsupported connector ABI version {version}; expected {ABI_VERSION}"
            ));
        }

        let engine = read_owned_buffer(engine_json(), free_buffer)?;
        Ok(Self {
            _library: library,
            engine,
            call_json,
            free_buffer,
        })
    }

    pub fn engine(&self) -> &str {
        &self.engine
    }

    pub fn call(&self, request: Value) -> Result<Value, String> {
        let request = request.to_string();
        call_owned_json(self.call_json, self.free_buffer, &request)
    }

    pub fn call_ok(&self, request: Value) -> Result<Value, String> {
        let response = self.call(request)?;
        if response.get("ok").and_then(Value::as_bool) == Some(false) {
            return Err(connector_error_message(&response));
        }
        Ok(response)
    }
}

pub fn probe_library(path: &Path) -> Result<NativeConnectorProbe, String> {
    let library = unsafe { Library::new(path) }
        .map_err(|error| load_error("failed to load native connector library", error))?;
    unsafe { probe_loaded_library(&library) }
}

unsafe fn probe_loaded_library(library: &Library) -> Result<NativeConnectorProbe, String> {
    let abi_version = *library
        .get::<AbiVersionFn>(b"irodori_extension_abi_version\0")
        .map_err(|error| format!("connector is missing irodori_extension_abi_version: {error}"))?;
    let engine_json = *library
        .get::<BufferFn>(b"irodori_connector_engine_json\0")
        .map_err(|error| format!("connector is missing irodori_connector_engine_json: {error}"))?;
    let manifest_json = *library
        .get::<BufferFn>(b"irodori_extension_manifest_json\0")
        .map_err(|error| {
            format!("connector is missing irodori_extension_manifest_json: {error}")
        })?;
    let config_json = *library
        .get::<BufferFn>(b"irodori_connector_config_json\0")
        .map_err(|error| format!("connector is missing irodori_connector_config_json: {error}"))?;
    let call_json = *library
        .get::<CallJsonFn>(b"irodori_connector_call_json\0")
        .map_err(|error| format!("connector is missing irodori_connector_call_json: {error}"))?;
    let free_buffer = *library
        .get::<FreeBufferFn>(b"irodori_connector_free_buffer\0")
        .map_err(|error| format!("connector is missing irodori_connector_free_buffer: {error}"))?;

    let version = abi_version();
    if version != ABI_VERSION {
        return Err(format!(
            "unsupported connector ABI version {version}; expected {ABI_VERSION}"
        ));
    }

    let engine = read_owned_buffer(engine_json(), free_buffer)?;
    let manifest_json = read_owned_buffer(manifest_json(), free_buffer)?;
    let config_json = read_owned_buffer(config_json(), free_buffer)?;
    let health = call_owned_json(call_json, free_buffer, r#"{"method":"health"}"#)?;
    let describe = call_owned_json(call_json, free_buffer, r#"{"method":"describe"}"#)?;

    Ok(NativeConnectorProbe {
        engine,
        manifest_json,
        config_json,
        health,
        describe,
    })
}

fn call_owned_json(
    call_json: CallJsonFn,
    free_buffer: FreeBufferFn,
    request: &str,
) -> Result<Value, String> {
    let buffer = IrodoriConnectorBuffer {
        ptr: request.as_ptr(),
        len: request.len(),
    };
    let response = unsafe { call_json(buffer) };
    let response = read_owned_buffer(response, free_buffer)?;
    serde_json::from_str(&response)
        .map_err(|error| format!("connector returned non-JSON response: {error}"))
}

pub fn connector_error_message(response: &Value) -> String {
    let message = response
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| response.get("message").and_then(Value::as_str))
        .unwrap_or("connector call failed");
    let Some(code) = response
        .get("error")
        .and_then(|error| error.get("code"))
        .and_then(Value::as_str)
    else {
        return message.to_string();
    };
    format!("{code}: {message}")
}

pub fn connector_request(method: &str, connection_id: &str) -> Value {
    json!({
        "method": method,
        "connectionId": connection_id,
    })
}

fn read_owned_buffer(
    buffer: IrodoriConnectorBuffer,
    free_buffer: FreeBufferFn,
) -> Result<String, String> {
    if buffer.ptr.is_null() {
        return if buffer.len == 0 {
            Ok(String::new())
        } else {
            Err("connector returned a null buffer with non-zero length".to_string())
        };
    }

    let bytes = unsafe { std::slice::from_raw_parts(buffer.ptr, buffer.len).to_vec() };
    unsafe { free_buffer(buffer) };
    String::from_utf8(bytes).map_err(|error| format!("connector returned invalid UTF-8: {error}"))
}

/// Serialize a probe as one line of JSON, for `--probe`.
pub fn probe_json(path: &Path) -> Result<String, String> {
    let probe = probe_library(path)?;
    serde_json::to_string(&json!({
        "engine": probe.engine,
        "manifestJson": probe.manifest_json,
        "configJson": probe.config_json,
        "health": probe.health,
        "describe": probe.describe,
    }))
    .map_err(|error| format!("failed to encode probe: {error}"))
}

/// Serve the connector over stdio: one JSON request per line on stdin, one
/// JSON response per line on stdout. The library is loaded once and kept for
/// the process lifetime, so a panic or segfault in the driver ends this process
/// and is reported to the parent as a closed pipe.
///
/// A driver's `println!` would corrupt the protocol, so `fd 1` is duplicated to
/// a saved handle and stdout is redirected to stderr before the library loads.
pub fn serve_stdio(library: &Path) -> Result<(), String> {
    let connector = NativeConnector::load(library)?;
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|error| format!("failed to read request: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(request) => connector
                .call(request)
                .unwrap_or_else(|error| connector_failure(&error)),
            Err(error) => connector_failure(&format!("invalid request JSON: {error}")),
        };
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
    }
    Ok(())
}

fn connector_failure(message: &str) -> Value {
    json!({
        "ok": false,
        "error": { "code": "connector.callFailed", "message": message },
    })
}

#[cfg(all(test, unix, not(target_os = "macos")))]
mod tests {
    use super::*;

    #[test]
    fn explains_a_glibc_mismatch() {
        let message = load_error(
            "failed to load native connector library",
            "version `GLIBC_2.39' not found",
        );
        assert!(message.contains("newer glibc"), "{message}");
    }

    #[test]
    fn passes_other_load_errors_through_unchanged() {
        let message = load_error(
            "failed to load native connector library",
            "cannot open shared object file",
        );
        assert!(
            message.contains("cannot open shared object file"),
            "{message}"
        );
        assert!(!message.contains("glibc"), "{message}");
    }
}
