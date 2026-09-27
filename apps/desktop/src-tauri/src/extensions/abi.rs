//! Connector C-ABI, re-exported from the shared `irodori-connector-host` crate.
//!
//! The same crate builds the `irodori-connector-host` sidecar, so the desktop
//! host and the out-of-process runner load connectors through one
//! implementation instead of two that can drift.

pub(crate) use irodori_connector_host::{
    connector_request, probe_library, NativeConnector, NativeConnectorProbe, ABI_VERSION,
};
