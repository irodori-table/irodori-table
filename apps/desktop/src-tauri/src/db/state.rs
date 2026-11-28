use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use irodori_completion::metadata::MetadataCache;
use irodori_error::{IrodoriError, IrodoriErrorKind};
use irodori_jobs::{run_job, BatchOutcome, BatchResult, JobKind, JobRuntime, JobSpec};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use super::connection::Connection;
use super::error::{DbError, DbResult};
use super::meta::convert_metadata_to_snapshot;
use super::metadata_manager::MetadataManager;
use super::query::sql_may_change_metadata;
use super::query_executor::QueryExecutor;
use super::result_spill_manager::{ResultEntry, ResultSpillManager};
use super::DatabaseMetadata;
use crate::jobs::JobState;

/// Finished result stores kept for windowed paging before the oldest is evicted
/// (closing its temp file). One per recent run/tab is plenty.
pub(super) const MAX_RETAINED_RESULTS: usize = 16;

#[derive(Default)]
pub(super) struct OpenConnections {
    next_session: u64,
    entries: HashMap<String, OpenConnection>,
}

struct OpenConnection {
    session: String,
    read_only: bool,
    driver: Arc<dyn Connection>,
}

impl OpenConnections {
    pub(super) fn insert(
        &mut self,
        id: String,
        driver: Arc<dyn Connection>,
        read_only: bool,
    ) -> (String, Option<Arc<dyn Connection>>) {
        self.next_session += 1;
        let session = self.next_session.to_string();
        let old = self.entries.insert(
            id,
            OpenConnection {
                session: session.clone(),
                read_only,
                driver,
            },
        );
        (session, old.map(|entry| entry.driver))
    }

    pub(super) fn get(&self, id: &str) -> Option<&Arc<dyn Connection>> {
        self.entries.get(id).map(|entry| &entry.driver)
    }

    pub(super) fn remove(&mut self, id: &str) -> Option<Arc<dyn Connection>> {
        self.entries.remove(id).map(|entry| entry.driver)
    }

    /// Check the reviewed session and retain its driver under the same lock.
    pub(super) fn for_request(
        &self,
        id: &str,
        expected: Option<&str>,
        write: bool,
    ) -> DbResult<Arc<dyn Connection>> {
        let entry = self
            .entries
            .get(id)
            .ok_or_else(|| DbError::not_found(format!("no open connection: {id}")))?;
        if expected.is_some_and(|expected| expected != entry.session) {
            return Err(DbError::validation(
                "connection session changed; review the operation again",
            ));
        }
        if entry.read_only && write {
            return Err(DbError::validation(
                "read-only connection: write operations are blocked",
            ));
        }
        Ok(entry.driver.clone())
    }
}

/// Open connections keyed by connection id. Lives in Tauri managed state.
#[derive(Clone)]
pub struct DbState {
    pub(super) conns: Arc<Mutex<OpenConnections>>,
    /// In-flight cancellable queries keyed by a caller-supplied `query_id`, so
    /// `db_cancel` can stop a specific run. Entries are removed when the run ends.
    pub(super) cancels: Arc<Mutex<HashMap<String, CancellationToken>>>,
    pub metadata_cache: Arc<Mutex<MetadataCache>>,
    metadata_generation: Arc<AtomicU64>,
    metadata_refresh_seq: Arc<AtomicU64>,
    pub(super) tunnels: Arc<Mutex<HashMap<String, CancellationToken>>>,
    /// Retained disk-offloaded results (EXEC-010), keyed by handle, for windowed
    /// paging. Bounded by `MAX_RETAINED_RESULTS`; evicting an entry closes its file.
    pub(super) results: Arc<Mutex<HashMap<String, ResultEntry>>>,
    /// Monotonic counter for handle generation and oldest-first eviction.
    pub(super) result_seq: Arc<AtomicU64>,
}

impl Default for DbState {
    fn default() -> Self {
        Self {
            conns: Default::default(),
            cancels: Arc::new(Mutex::new(HashMap::new())),
            metadata_cache: Arc::new(Mutex::new(MetadataCache::new())),
            metadata_generation: Arc::new(AtomicU64::new(0)),
            metadata_refresh_seq: Arc::new(AtomicU64::new(0)),
            tunnels: Arc::new(Mutex::new(HashMap::new())),
            results: Arc::new(Mutex::new(HashMap::new())),
            result_seq: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl DbState {
    pub(crate) fn query_executor(&self) -> QueryExecutor<'_> {
        QueryExecutor::new(self)
    }

    pub(crate) fn metadata_manager(&self) -> MetadataManager<'_> {
        MetadataManager::new(self)
    }

    pub(crate) fn result_spill_manager(&self) -> ResultSpillManager<'_> {
        ResultSpillManager::new(self)
    }
}

pub(super) fn trigger_background_refresh(state: DbState, connection_id: String) {
    let generation = metadata_generation(&state);
    tokio::spawn(async move {
        let conn = {
            let guard = state.conns.lock().await;
            guard.get(&connection_id).cloned()
        };
        if let Some(conn) = conn {
            match conn.metadata().await {
                Ok(db_meta) => {
                    let _ = upsert_metadata_snapshot_if_current(
                        &state,
                        &connection_id,
                        &db_meta,
                        generation,
                    )
                    .await;
                }
                Err(e) => {
                    eprintln!(
                        "background metadata refresh failed for connection {connection_id}: {e}"
                    );
                }
            }
        }
    });
}

pub(super) fn trigger_metadata_refresh_job(
    state: DbState,
    jobs: &JobState,
    connection_id: String,
) -> Result<String, IrodoriError> {
    let sequence = state.metadata_refresh_seq.fetch_add(1, Ordering::SeqCst);
    let job_id = format!("metadata-refresh-{connection_id}-{sequence}");
    let generation = metadata_generation(&state);
    let spec = JobSpec {
        source: Some(connection_id.clone()),
        tags: vec!["metadata".to_string(), "cache".to_string()],
        ..JobSpec::new(
            JobKind::KnowledgeRefresh,
            format!("refresh metadata: {connection_id}"),
        )
    };
    jobs.runtime().submit_with_id(&job_id, spec)?;

    let runtime = jobs.runtime_arc();
    let spawned_id = job_id.clone();
    tokio::spawn(async move {
        if let Err(error) =
            run_metadata_refresh_job(state, runtime, connection_id, spawned_id, generation).await
        {
            eprintln!("metadata refresh job failed: {error}");
        }
    });

    Ok(job_id)
}

async fn run_metadata_refresh_job(
    state: DbState,
    runtime: Arc<JobRuntime>,
    connection_id: String,
    job_id: String,
    generation: u64,
) -> Result<(), IrodoriError> {
    run_job(&runtime, &job_id, |ctx| async move {
        ctx.report_progress(0, Some(1), "metadata", "loading metadata")?;
        if ctx.should_cancel() {
            return Ok(BatchResult::new(
                BatchOutcome::cancelled("metadata refresh cancelled before fetch"),
                (),
            ));
        }

        let conn = {
            let guard = state.conns.lock().await;
            guard.get(&connection_id).cloned().ok_or_else(|| {
                IrodoriError::new(
                    IrodoriErrorKind::NotFound,
                    format!("no open connection: {connection_id}"),
                )
            })?
        };
        let db_meta = conn.metadata().await.map_err(|message| {
            IrodoriError::new(
                IrodoriErrorKind::Metadata,
                format!("metadata refresh failed for {connection_id}: {message}"),
            )
        })?;

        if ctx.should_cancel() {
            return Ok(BatchResult::new(
                BatchOutcome::cancelled("metadata refresh cancelled after fetch"),
                (),
            ));
        }

        let updated =
            upsert_metadata_snapshot_if_current(&state, &connection_id, &db_meta, generation).await;
        ctx.report_progress(1, Some(1), "metadata", "metadata refresh finished")?;
        let message = if updated {
            format!("metadata refreshed for {connection_id}")
        } else {
            format!("metadata refresh skipped for stale generation: {connection_id}")
        };
        Ok(BatchResult::new(BatchOutcome::completed(message), ()))
    })
    .await
    .map(|_| ())
}

pub(super) fn metadata_generation(state: &DbState) -> u64 {
    state.metadata_generation.load(Ordering::SeqCst)
}

pub(super) async fn upsert_metadata_snapshot_if_current(
    state: &DbState,
    connection_id: &str,
    db_meta: &DatabaseMetadata,
    generation: u64,
) -> bool {
    if metadata_generation(state) != generation {
        return false;
    }

    let mut cache = state.metadata_cache.lock().await;
    if metadata_generation(state) != generation {
        return false;
    }
    let snapshot = convert_metadata_to_snapshot(connection_id, db_meta);
    cache.upsert_snapshot(snapshot);
    let _ = cache.drain_refresh_requests();
    true
}

pub(super) async fn refresh_metadata_after_query_if_needed(
    state: &DbState,
    connection_id: &str,
    sql: &str,
) {
    if sql_may_change_metadata(sql) {
        refresh_metadata_after_mutation(state, connection_id).await;
    }
}

pub(super) async fn refresh_metadata_after_mutation(state: &DbState, connection_id: &str) {
    bump_metadata_generation(state);
    state
        .metadata_cache
        .lock()
        .await
        .invalidate_connection(connection_id);
    trigger_background_refresh(state.clone(), connection_id.to_string());
}

fn bump_metadata_generation(state: &DbState) {
    state.metadata_generation.fetch_add(1, Ordering::SeqCst);
}
