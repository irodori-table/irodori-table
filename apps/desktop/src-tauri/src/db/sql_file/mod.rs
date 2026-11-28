//! A picked file and its exact SQLite target stay together from preview to run.
//! Only a bounded prefix crosses IPC; the job owns its file and database session.

mod reader;

use std::{
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use irodori_error::Result;
use irodori_jobs::{run_job, BatchOutcome, BatchResult, JobContext, JobKind, JobRuntime, JobSpec};
use serde::Serialize;
use sqlx::{ConnectOptions, Connection as _, SqlitePool};
use tauri_plugin_dialog::DialogExt;
use tokio::{
    fs::File,
    io::{AsyncRead, AsyncReadExt, AsyncSeekExt},
    sync::{oneshot, Mutex},
};
use ts_rs::TS;

use super::{connection::Connection, DbError, DbState};
use crate::jobs::JobState;
use reader::ScriptReader;

const PREVIEW_BYTES: usize = 4096;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SqlFilePreview {
    database: String,
    preview_bytes: u32,
    token: String,
    name: String,
    size: u64,
    preview: String,
}

struct Selection {
    token: String,
    name: String,
    size: u64,
    modified: Option<std::time::SystemTime>,
    file: File,
    connection_id: String,
    connection: Arc<dyn Connection>,
}

#[derive(Default)]
pub struct SqlFileState {
    // At most one open file waiting for a decision, even if the window reloads.
    selection: Mutex<Option<Selection>>,
    sequence: AtomicU64,
}

pub(super) fn validate_session_options(
    options: &sqlx::sqlite::SqliteConnectOptions,
) -> super::DbResult<()> {
    // SQLx exposes the parsed flags via ConnectOptions::to_url_lossy. Only
    // serialize the flags: a local filename can contain a drive letter or
    // SQLite's special "file:" prefix and need not be a URL authority.
    let flags = options.clone().filename("main").to_url_lossy();
    let has = |key: &str, value: &str| flags.query_pairs().any(|(k, v)| k == key && v == value);
    if has("mode", "ro") || has("immutable", "true") {
        return Err(DbError::validation(
            "SQL file jobs require a writable SQLite connection",
        ));
    }
    if options.get_filename().as_os_str().is_empty()
        || (has("mode", "memory") && has("cache", "private"))
    {
        return Err(DbError::validation(
            "This SQLite database is private to the editor session. To run a file, use a database file or shared in-memory SQLite connection.",
        ));
    }
    Ok(())
}

async fn target(state: &DbState, id: &str) -> Result<Arc<dyn Connection>> {
    let conn = state
        .conns
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or_else(|| DbError::not_found("SQLite connection is closed"))?;
    conn.sql_file_pool()?;
    Ok(conn)
}

async fn preview_file(path: &Path) -> Result<(File, std::fs::Metadata, String)> {
    let io_error = |e| DbError::validation(format!("cannot read SQL file: {e}"));
    let metadata = tokio::fs::metadata(path).await.map_err(io_error)?;
    if !metadata.is_file() {
        return Err(DbError::validation("select a regular SQL file").into());
    }
    let mut file = File::open(path).await.map_err(io_error)?;
    let info = file.metadata().await.map_err(io_error)?;
    if !info.is_file() {
        return Err(DbError::validation("select a regular SQL file").into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(PREVIEW_BYTES as u64)
        .read_to_end(&mut bytes)
        .await
        .map_err(io_error)?;
    file.rewind().await.map_err(io_error)?;
    Ok((file, info, String::from_utf8_lossy(&bytes).into_owned()))
}

#[tauri::command]
pub async fn db_pick_sql_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    files: tauri::State<'_, SqlFileState>,
    connection_id: String,
) -> Result<Option<SqlFilePreview>> {
    let connection = target(&state, &connection_id).await?;
    let (send, receive) = oneshot::channel();
    app.dialog()
        .file()
        .add_filter("SQL", &["sql"])
        .pick_file(move |file| {
            let _ = send.send(file);
        });
    let Some(path) = receive
        .await
        .map_err(|_| DbError::cancelled("file picker closed"))?
    else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|_| DbError::validation("select a local SQL file"))?;
    prepare_selection(&files, connection, connection_id, &path)
        .await
        .map(Some)
}

async fn prepare_selection(
    files: &SqlFileState,
    connection: Arc<dyn Connection>,
    connection_id: String,
    path: &Path,
) -> Result<SqlFilePreview> {
    let name = path
        .file_name()
        .ok_or_else(|| DbError::validation("missing file name"))?
        .to_string_lossy()
        .into_owned();
    let (file, info, preview) = preview_file(path).await?;
    let size = info.len();
    let database = connection
        .sql_file_pool()?
        .connect_options()
        .get_filename()
        .to_string_lossy()
        .into_owned();
    let preview_bytes = size.min(PREVIEW_BYTES as u64) as u32;
    let token = files.sequence.fetch_add(1, Ordering::Relaxed).to_string();
    *files.selection.lock().await = Some(Selection {
        token: token.clone(),
        modified: info.modified().ok(),
        file,
        size,
        name: name.clone(),
        connection_id,
        connection,
    });
    Ok(SqlFilePreview {
        database,
        preview_bytes,
        token,
        name,
        size,
        preview,
    })
}

#[tauri::command]
pub async fn db_finish_sql_file(
    state: tauri::State<'_, DbState>,
    files: tauri::State<'_, SqlFileState>,
    jobs: tauri::State<'_, JobState>,
    connection_id: String,
    token: String,
    run: bool,
) -> Result<Option<String>> {
    finish_selection(&state, &files, &jobs, connection_id, &token, run).await
}

async fn finish_selection(
    state: &DbState,
    files: &SqlFileState,
    jobs: &JobState,
    connection_id: String,
    token: &str,
    run: bool,
) -> Result<Option<String>> {
    let selection = files
        .selection
        .lock()
        .await
        .take_if(|s| s.token == token && s.connection_id == connection_id);
    if !run {
        return Ok(None);
    }
    let selected = selection.ok_or_else(|| {
        DbError::validation("The SQL file selection expired. Select the file again.")
    })?;
    let current = target(state, &connection_id).await?;
    if !Arc::ptr_eq(&current, &selected.connection) {
        return Err(DbError::validation(
            "The selected database connection changed. Select the file again.",
        )
        .into());
    }
    let info = selected
        .file
        .metadata()
        .await
        .map_err(|e| DbError::validation(format!("cannot inspect picked SQL file: {e}")))?;
    if info.len() != selected.size || info.modified().ok() != selected.modified {
        return Err(DbError::validation(
            "The SQL file changed after preview. Select the file again.",
        )
        .into());
    }
    let pool = current.sql_file_pool()?.clone();
    let runtime = jobs.runtime_arc();
    let id = runtime
        .submit(JobSpec {
            source: Some(connection_id.clone()),
            ..JobSpec::new(
                JobKind::Import,
                format!("{} · {connection_id}", selected.name),
            )
        })?
        .id;
    if let Err(e) = runtime.start(&id) {
        runtime.fail(&id, e.clone())?;
        return Err(e);
    }
    let db = state.clone();
    let job_id = id.clone();
    tokio::spawn(async move {
        let _ = run_file(
            &pool,
            selected.file.take(selected.size),
            selected.size,
            runtime,
            &job_id,
        )
        .await;
        // Statements before an error or cancellation may have committed DDL.
        if db
            .conns
            .lock()
            .await
            .get(&connection_id)
            .is_some_and(|c| Arc::ptr_eq(c, &current))
        {
            super::state::refresh_metadata_after_mutation(&db, &connection_id).await;
        }
    });
    Ok(Some(id))
}

async fn run_file<R: AsyncRead + Unpin>(
    pool: &SqlitePool,
    file: R,
    size: u64,
    runtime: Arc<JobRuntime>,
    job_id: &str,
) -> Result<()> {
    let observer = runtime.clone();
    run_job(&runtime, job_id, |ctx| async move {
        let mut conn = (*pool.connect_options())
            .clone()
            .create_if_missing(false)
            .connect()
            .await
            .map_err(|e| {
                DbError::connection(format!("cannot open SQLite file-job session: {e}"))
            })?;
        let id = ctx.job_id().to_owned();
        let monitor = pool.clone();
        conn.lock_handle()
            .await
            .map_err(query_error)?
            .set_progress_handler(4096, move || {
                !monitor.is_closed() && !observer.should_cancel(&id)
            });
        let result = execute_file(pool, &mut conn, file, size, &ctx).await;
        // Closing the dedicated connection always rolls back any uncommitted
        // work, including a SAVEPOINT or BEGIN authored by the script.
        conn.close().await.map_err(query_error)?;
        result.map(|outcome| BatchResult::new(outcome, ()))
    })
    .await
    .map(|_| ())
}

fn query_error(e: sqlx::Error) -> DbError {
    DbError::query(format!("SQLite file job: {e}"))
}

async fn execute_file<R: AsyncRead + Unpin>(
    pool: &SqlitePool,
    conn: &mut sqlx::SqliteConnection,
    file: R,
    size: u64,
    ctx: &JobContext<'_>,
) -> Result<BatchOutcome> {
    let mut reader = ScriptReader::new(file);
    let mut completed = 0;
    let mut last_byte = 0;
    ctx.report_progress(0, Some(size), "bytes", "Reading SQL file")?;
    let cancelled = || pool.is_closed() || ctx.should_cancel();
    let last_position = |count, byte| {
        let unit = if count == 1 {
            "statement"
        } else {
            "statements"
        };
        format!("{count} {unit} completed through byte {byte}")
    };
    let stopped = |count, byte| {
        BatchOutcome::cancelled(format!(
            "Stopped after {}. Any open transaction was rolled back.",
            last_position(count, byte)
        ))
    };

    loop {
        if cancelled() {
            return Ok(stopped(completed, last_byte));
        }
        let next = reader.next().await.map_err(|e| {
            DbError::validation(format!("{e}. {}", last_position(completed, last_byte)))
        })?;
        let Some(stmt) = next else {
            break;
        };
        if cancelled() {
            continue;
        }
        if stmt.sql.as_bytes().contains(&0) {
            return Err(DbError::validation(format!(
                "Unexpected NUL in statement {} at line {}, byte {}. {}",
                completed + 1,
                stmt.line,
                stmt.start,
                last_position(completed, last_byte)
            ))
            .into());
        }
        if let Err(error) = sqlx::raw_sql(super::audited_sql(&stmt.sql))
            .execute(&mut *conn)
            .await
        {
            if cancelled() {
                return Ok(stopped(completed, last_byte));
            }
            let error: String = error.to_string().chars().take(1024).collect();
            return Err(DbError::query(format!(
                "Statement {} at line {}, byte {} failed. {error}. {}. Any open transaction was rolled back.",
                completed + 1, stmt.line, stmt.start, last_position(completed, last_byte)
            )).into());
        }
        completed += 1;
        last_byte = stmt.end;
        ctx.report_progress(
            last_byte,
            Some(size),
            "bytes",
            last_position(completed, last_byte),
        )?;
    }
    if reader.position() != size {
        return Err(DbError::validation(format!(
            "SQL file size changed during the run. {}",
            last_position(completed, last_byte)
        ))
        .into());
    }
    // SAFETY: SQLx holds SQLite's connection lock throughout this read. The
    // handle is live and the worker cannot be running a statement on it.
    let mut handle = conn.lock_handle().await.map_err(query_error)?;
    if unsafe { libsqlite3_sys::sqlite3_get_autocommit(handle.as_raw_handle().as_ptr()) } == 0 {
        return Err(DbError::query(format!(
            "File ended with an open transaction. It was rolled back. {}",
            last_position(completed, last_byte)
        ))
        .into());
    }
    let message = last_position(completed, last_byte);
    ctx.report_progress(size, Some(size), "bytes", &message)?;
    Ok(BatchOutcome::completed(message))
}

#[cfg(test)]
mod tests;
