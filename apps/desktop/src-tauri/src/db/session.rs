//! One held connection for the statements a user runs from the editor.
//!
//! Each run used to borrow whichever pooled connection was free. So `begin`,
//! `delete …` and `rollback`, run one at a time, could land on different
//! connections. The delete could autocommit on one while the rollback ran
//! on another, and a connection left inside an open transaction went back to
//! the pool for the next query, whatever asked for it. Transactions, `SET` and
//! temporary tables live on one connection, so the user's statements now go
//! through a single held connection per open database connection, as in
//! psql or any database IDE. Metadata, autocomplete and grid edits keep
//! using the pool.

use futures_util::future::BoxFuture;
use sqlx::pool::PoolConnection;
use sqlx::{Connection as _, Database, Pool};
use tokio::sync::{Mutex, MutexGuard};

use super::error::{DbError, DbResult};

/// Reads the server's id for a connection's session, for cancelling it.
pub(crate) type Identify<DB> =
    for<'c> fn(&'c mut <DB as Database>::Connection) -> BoxFuture<'c, Option<i64>>;

/// Cancels the statement running in a server session, over another connection.
pub(crate) type CancelRunning<DB> = fn(Pool<DB>, i64) -> BoxFuture<'static, ()>;

pub(crate) struct Session<DB: Database> {
    pool: Pool<DB>,
    held: Mutex<Option<Held<DB>>>,
    identify: Identify<DB>,
    cancel: CancelRunning<DB>,
}

struct Held<DB: Database> {
    conn: PoolConnection<DB>,
    server_id: Option<i64>,
}

impl<DB: Database> Session<DB> {
    pub(crate) fn new(pool: Pool<DB>, identify: Identify<DB>, cancel: CancelRunning<DB>) -> Self {
        Self {
            pool,
            held: Mutex::new(None),
            identify,
            cancel,
        }
    }

    /// Take the session for one run. Runs on the same database connection
    /// queue here and execute one after another, as they would on a single
    /// connection anywhere. The connection is opened on first use.
    pub(crate) async fn begin(&self) -> DbResult<SessionGuard<'_, DB>> {
        let mut slot = self.held.lock().await;
        if slot.is_none() {
            let mut conn = self.pool.acquire().await.map_err(|e| {
                DbError::connection(format!("could not open a session connection: {e}"))
            })?;
            let server_id = (self.identify)(&mut conn).await;
            *slot = Some(Held { conn, server_id });
        }
        Ok(SessionGuard {
            slot,
            pool: self.pool.clone(),
            cancel: self.cancel,
            finished: false,
        })
    }

    /// Give the session back and close the pool. Closing a pool waits for every
    /// checked-out connection, so the held one has to be released first.
    pub(crate) async fn close(&self) {
        self.held.lock().await.take();
        self.pool.close().await;
    }
}

/// The session for the duration of one run.
pub(crate) struct SessionGuard<'a, DB: Database> {
    slot: MutexGuard<'a, Option<Held<DB>>>,
    pool: Pool<DB>,
    cancel: CancelRunning<DB>,
    finished: bool,
}

impl<DB: Database> SessionGuard<'_, DB> {
    pub(crate) fn conn(&mut self) -> &mut DB::Connection {
        &mut self
            .slot
            .as_mut()
            .expect("a session guard always holds a connection")
            .conn
    }

    /// Hand back a run's result. A failed statement keeps the session, since a
    /// syntax error inside a transaction leaves it for the user to roll back.
    /// A failure that took the connection with it discards the session, and
    /// the next run opens a fresh one.
    pub(crate) async fn finish<T>(mut self, result: DbResult<T>) -> DbResult<T> {
        if result.is_err() && self.conn().ping().await.is_err() {
            self.slot.take();
        }
        self.finished = true;
        result
    }
}

impl<DB: Database> Drop for SessionGuard<'_, DB> {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        // Dropped mid-statement: the run was cancelled or timed out. The
        // connection is part-way through a response, so it is closed rather
        // than reused, and the statement is cancelled on the server so it does
        // not run on to completion. The server rolls back a transaction open on
        // that connection, which is also where cancelling a statement inside a
        // transaction leaves it.
        if let Some(mut held) = self.slot.take() {
            held.conn.close_on_drop();
            if let (Some(id), Ok(runtime)) = (held.server_id, tokio::runtime::Handle::try_current())
            {
                runtime.spawn((self.cancel)(self.pool.clone(), id));
            }
        }
    }
}
