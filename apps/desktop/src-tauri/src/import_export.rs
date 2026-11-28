use std::{
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{Manager, Resource, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;

// The webview receives an opaque handle. Only the native save dialog chooses
// the destination. Staging in the same directory makes final replacement atomic.
struct ImportOutput {
    destination: PathBuf,
    staged: Mutex<Option<NamedTempFile>>,
}

impl Resource for ImportOutput {}

impl ImportOutput {
    fn new(destination: PathBuf) -> io::Result<Self> {
        let parent = destination
            .parent()
            .ok_or_else(|| io::Error::other("Missing parent directory"))?;
        let file = tempfile::Builder::new()
            .prefix(".irodori-import-")
            .tempfile_in(parent)?;
        Ok(Self {
            destination,
            staged: Mutex::new(Some(file)),
        })
    }

    fn append(&self, sql: &str) -> io::Result<()> {
        let mut slot = self
            .staged
            .lock()
            .map_err(|_| io::Error::other("Import writer unavailable"))?;
        let file = slot
            .as_mut()
            .ok_or_else(|| io::Error::other("Import output is closed"))?;
        if let Err(error) = file.write_all(sql.as_bytes()) {
            slot.take();
            return Err(error);
        }
        Ok(())
    }

    fn finish(&self, publish: bool) -> io::Result<()> {
        let file = self
            .staged
            .lock()
            .map_err(|_| io::Error::other("Import writer unavailable"))?
            .take();
        if publish {
            let file = file.ok_or_else(|| io::Error::other("Import output is closed"))?;
            file.as_file().sync_all()?;
            file.persist(&self.destination)?;
        }
        Ok(())
    }
}

#[tauri::command]
pub(crate) async fn import_output_open(
    window: WebviewWindow,
    name: String,
) -> Result<Option<u32>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_name = Path::new(&name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("import.sql");
        let selected = window
            .dialog()
            .file()
            .add_filter("SQL", &["sql"])
            .set_file_name(file_name)
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        let output = ImportOutput::new(path).map_err(|e| e.to_string())?;
        Ok(Some(window.resources_table().add(output)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn import_output_append(
    window: WebviewWindow,
    handle: u32,
    sql: String,
) -> Result<(), String> {
    let output = window
        .resources_table()
        .get::<ImportOutput>(handle)
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || output.append(&sql))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn import_output_finish(
    window: WebviewWindow,
    handle: u32,
    publish: bool,
) -> Result<(), String> {
    let output = window
        .resources_table()
        .take::<ImportOutput>(handle)
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || output.finish(publish))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_output_publishes_only_after_a_complete_save() {
        let root = tempfile::tempdir().unwrap();
        let dest = root.path().join("data.sql");
        std::fs::write(&dest, "old").unwrap();
        let output = ImportOutput::new(dest.clone()).unwrap();
        output.append("partial").unwrap();
        output.finish(false).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "old");
        assert!(output.finish(true).is_err());

        let output = ImportOutput::new(dest.clone()).unwrap();
        output.append("complete").unwrap();
        output.append(" script").unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "old");
        output.finish(true).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "complete script");
        let abandoned = ImportOutput::new(dest.clone()).unwrap();
        abandoned.append("interrupted").unwrap();
        drop(abandoned);
        assert_eq!(root.path().read_dir().unwrap().count(), 1);
        let failure = ImportOutput::new(root.path().join("occupied")).unwrap();
        std::fs::create_dir(root.path().join("occupied")).unwrap();
        assert!(failure.finish(true).is_err());
        assert_eq!(root.path().read_dir().unwrap().count(), 2);
    }
}
