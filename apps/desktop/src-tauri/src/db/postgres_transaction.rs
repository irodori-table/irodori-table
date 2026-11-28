//! Manual mode uses the same held connection as explicit editor transactions.
//! Query PostgreSQL from the pool so a status check never starts a transaction
//! on the editor session. This also detects rollback after a lost session.
use std::time::Instant;

use sqlx::{PgPool, Postgres};

use super::error::describe_sqlx_error;
use super::query::{sql_tokens, PreparedQuery, RawResultSet};
use super::session::{Session, SessionGuard};
use super::stream::{StreamCtx, StreamSummary};
use super::{postgres, split_sql_statements, DbError, DbResult, DbState};

pub async fn editor_transaction_pending_impl(state: &DbState, id: &str) -> DbResult<bool> {
    let conn = state
        .conns
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or_else(|| DbError::not_found(format!("no open connection: {id}")))?;
    let session = conn.postgres_editor()?;
    match session.held_server_id().await {
        Some(pid) => transaction_pending(session.pool(), pid).await,
        None => Ok(false),
    }
}

async fn transaction_pending(pool: &PgPool, pid: i64) -> DbResult<bool> {
    let state = sqlx::query_scalar::<_, Option<String>>(
        "SELECT state FROM pg_catalog.pg_stat_activity WHERE pid = $1::bigint",
    )
    .bind(pid)
    .fetch_optional(pool)
    .await
    .map_err(|e| DbError::query(describe_sqlx_error(&e)))?;
    match state.as_ref().and_then(|s| s.as_deref()) {
        Some("idle in transaction" | "idle in transaction (aborted)") => Ok(true),
        Some("idle" | "active") | None => Ok(false),
        Some(_) => Err(DbError::unsupported(
            "PostgreSQL session activity is unavailable for manual transactions",
        )),
    }
}

async fn begin_if_needed(
    session: &Session<Postgres>,
    guard: &mut SessionGuard<'_, Postgres>,
    sql: &str,
) -> DbResult<()> {
    match sql_tokens(sql).next().as_deref() {
        None | Some("begin" | "start" | "commit" | "end" | "abort" | "rollback" | "prepare") => {
            return Ok(())
        }
        _ => {}
    }
    let pid = guard.server_id().ok_or_else(|| {
        DbError::unsupported("PostgreSQL session ID is unavailable for manual transactions")
    })?;
    if !transaction_pending(session.pool(), pid).await? {
        sqlx::query("BEGIN")
            .execute(guard.conn())
            .await
            .map_err(|e| DbError::query(describe_sqlx_error(&e)))?;
    }
    Ok(())
}

pub(super) async fn run(
    session: &Session<Postgres>,
    query: &PreparedQuery,
    cap: usize,
) -> DbResult<Vec<RawResultSet>> {
    let mut guard = session.begin().await?;
    let result = async {
        let mut sets = Vec::new();
        for (statement_index, sql) in split_sql_statements(&query.sql).into_iter().enumerate() {
            let start = Instant::now();
            begin_if_needed(session, &mut guard, &sql).await?;
            let ((columns, rows, truncated), affected_rows) = if query.params.is_empty() {
                postgres::run_query_affected(guard.conn(), &sql, cap).await?
            } else {
                // Parameter preparation accepts just one statement.
                postgres::run_prepared_query_affected(guard.conn(), query, cap).await?
            };
            sets.push(RawResultSet {
                statement_index,
                statement: sql,
                columns,
                rows,
                truncated,
                affected_rows,
                elapsed_ms: start.elapsed().as_millis() as u64,
            });
        }
        Ok(sets)
    }
    .await;
    guard.finish(result).await
}

pub(super) async fn stream(
    session: &Session<Postgres>,
    query: &PreparedQuery,
    ctx: &StreamCtx,
) -> DbResult<StreamSummary> {
    let mut guard = session.begin().await?;
    let result = async {
        let mut total = StreamSummary {
            row_count: 0,
            truncated: false,
            result_sets: vec![],
        };
        for (index, sql) in split_sql_statements(&query.sql).into_iter().enumerate() {
            if ctx.cancelled() {
                return Err(DbError::cancelled("query cancelled"));
            }
            let start = Instant::now();
            begin_if_needed(session, &mut guard, &sql).await?;
            let set_ctx = ctx.for_result_set(index);
            let mut summary = if query.params.is_empty() {
                postgres::stream_query(guard.conn(), &sql, &set_ctx).await?
            } else {
                postgres::stream_prepared_query(guard.conn(), query, &set_ctx).await?
            };
            for set in &mut summary.result_sets {
                set.elapsed_ms = start.elapsed().as_millis() as u64;
            }
            total.row_count += summary.row_count;
            total.truncated |= summary.truncated;
            total.result_sets.extend(summary.result_sets);
        }
        Ok(total)
    }
    .await;
    guard.finish(result).await
}
