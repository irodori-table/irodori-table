//! Running extension code out of process.
//!
//! Native modules build with `panic = "abort"` and the ABI has no
//! `catch_unwind`, so a panic or segfault while the host holds a downloaded
//! library aborts the whole application. Probing a library and calling a tool go
//! through the `irodori-connector-host` sidecar instead: a crash there is a failed
//! install or a failed call, not a dead app.
//!
//! The connection path still loads in-process for now.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde_json::Value;

use super::abi::{connector_error_message, probe_library, NativeConnector, NativeConnectorProbe};

/// A tool answers from its form input alone, so anything near this has hung.
const TOOL_CALL_TIMEOUT: Duration = Duration::from_secs(20);

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

/// Call a tool, preferring the sidecar like [`probe_connector`].
pub(crate) fn call_tool(library: &Path, request: &Value) -> Result<Value, String> {
    match connector_host_binary() {
        Ok(host) => {
            let mut command = Command::new(host);
            command.arg(library);
            call_tool_via_process(command, request, TOOL_CALL_TIMEOUT)
        }
        Err(_) => NativeConnector::load(library)?.call_ok(request.clone()),
    }
}

/// One process per call: the sidecar serves until its stdin closes, and a form
/// changes rarely enough that keeping one alive would only add a lifetime to
/// manage. Writing the request and closing stdin makes it answer and exit.
fn call_tool_via_process(
    mut command: Command,
    request: &Value,
    timeout: Duration,
) -> Result<Value, String> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Without this a GUI app gets a console window flashing on every call.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to run the extension host: {error}"))?;

    let (Some(mut stdin), Some(mut stdout), Some(mut stderr)) =
        (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("the extension host has no pipes".to_string());
    };
    // A failed write means the process already died; its stderr says why.
    let _ = writeln!(stdin, "{request}");
    drop(stdin);

    let error_output = thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut text = String::new();
        let _ = stdout.read_to_string(&mut text);
        let _ = sender.send(text);
    });

    let Ok(output) = receiver.recv_timeout(timeout) else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("the extension did not answer in time".to_string());
    };
    let _ = child.wait();
    parse_tool_response(&output, &error_output.join().unwrap_or_default())
}

fn parse_tool_response(output: &str, error_output: &str) -> Result<Value, String> {
    let Some(line) = output.lines().find(|line| !line.trim().is_empty()) else {
        let detail = error_output.trim();
        return Err(if detail.is_empty() {
            "the extension stopped without answering".to_string()
        } else {
            format!("the extension stopped without answering: {detail}")
        });
    };
    let response: Value = serde_json::from_str(line)
        .map_err(|error| format!("the extension returned invalid JSON: {error}"))?;
    if response.get("ok").and_then(Value::as_bool) == Some(false) {
        return Err(connector_error_message(&response));
    }
    Ok(response)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tool_response_is_returned_whole() {
        let response = parse_tool_response("{\"ok\":true,\"title\":\"t\"}\n", "").unwrap();
        assert_eq!(response["title"], "t");
    }

    #[test]
    fn a_tool_error_is_its_message() {
        let error = parse_tool_response(
            "{\"ok\":false,\"error\":{\"code\":\"tool.invalidInput\",\"message\":\"no keys\"}}",
            "",
        )
        .unwrap_err();
        assert!(error.contains("no keys"), "{error}");
    }

    #[test]
    fn a_process_that_dies_silently_is_an_error_with_what_it_said() {
        assert!(parse_tool_response("", "").unwrap_err().contains("stopped"));
        let error = parse_tool_response("", "failed to load library").unwrap_err();
        assert!(error.contains("failed to load library"), "{error}");
    }

    #[test]
    fn a_response_that_is_not_json_is_an_error() {
        assert!(parse_tool_response("not json", "")
            .unwrap_err()
            .contains("invalid JSON"));
    }

    #[cfg(unix)]
    fn shell(body: &str) -> Command {
        let mut command = Command::new("sh");
        command.arg("-c").arg(body);
        command
    }

    #[cfg(unix)]
    #[test]
    fn the_request_reaches_the_process_and_its_answer_comes_back() {
        // Echoes the request back inside an answer, so both directions are seen.
        let response = call_tool_via_process(
            shell(r#"read line; printf '{"ok":true,"got":%s}\n' "$line""#),
            &serde_json::json!({ "tool": "t" }),
            Duration::from_secs(5),
        )
        .unwrap();
        assert_eq!(response["got"]["tool"], "t");
    }

    #[cfg(unix)]
    #[test]
    fn a_crash_is_an_error_and_not_a_dead_host() {
        let error = call_tool_via_process(
            shell("echo boom >&2; kill -SEGV $$"),
            &serde_json::json!({}),
            Duration::from_secs(5),
        )
        .unwrap_err();
        assert!(error.contains("boom"), "{error}");
    }

    #[cfg(unix)]
    #[test]
    fn a_process_that_hangs_is_killed() {
        let started = std::time::Instant::now();
        let error = call_tool_via_process(
            shell("exec sleep 30"),
            &serde_json::json!({}),
            Duration::from_millis(200),
        )
        .unwrap_err();
        assert!(error.contains("in time"), "{error}");
        assert!(started.elapsed() < Duration::from_secs(10));
    }
}
