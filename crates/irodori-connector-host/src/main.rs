use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

/// Out-of-process connector host.
///
/// Two modes:
///   irodori-connector-host --probe <library>   print one probe JSON line, exit
///   irodori-connector-host <library>           one JSON request per stdin line,
///                                              one JSON response per stdout line
///
/// Running the connector here keeps a driver panic or segfault — connectors
/// build with `panic = "abort"`, so the desktop host cannot catch it — from
/// taking the application down.
fn main() -> ExitCode {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    match args.as_slice() {
        [flag, library] if flag.to_string_lossy() == "--probe" => {
            match irodori_connector_host::probe_json(&PathBuf::from(library)) {
                Ok(json) => {
                    println!("{json}");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("{error}");
                    ExitCode::FAILURE
                }
            }
        }
        [library] => match irodori_connector_host::serve_stdio(&PathBuf::from(library)) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        },
        _ => {
            eprintln!("usage: irodori-connector-host [--probe] <library>");
            ExitCode::from(2)
        }
    }
}
