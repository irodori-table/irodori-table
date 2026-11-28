use super::*;
use crate::db::{connect_impl, run_query_impl, ConnectionProfile};
use crate::security::SecurityState;
use irodori_jobs::JobStatus;
use std::{path::PathBuf, time::Duration};

fn file_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("irodori-sqlfile-{name}-{}", std::process::id()))
}

fn new_job() -> (Arc<JobRuntime>, String) {
    let runtime = Arc::new(JobRuntime::default());
    let id = runtime
        .submit(JobSpec::new(JobKind::Import, "SQL file"))
        .unwrap()
        .id;
    (runtime, id)
}

async fn test_pool() -> SqlitePool {
    super::super::sqlite::connect("sqlite::memory:")
        .await
        .unwrap()
}

#[tokio::test]
async fn sqlite_file_streams_large_script_preserving_session_trigger_and_position() {
    let pool = test_pool().await;
    let path = file_path("complete.sql");
    let mut sql = format!("/*{}*/\n", "x;".repeat(reader::READ_BYTES));
    sql.push_str(
        r#"
      CREATE TABLE data (id INTEGER PRIMARY KEY, txt TEXT);
      CREATE TABLE audit (id INTEGER, txt TEXT);
      CREATE TEMP TABLE scratch (id INTEGER);
      BEGIN;
      CREATE TEMP TRIGGER tracker AFTER INSERT ON data BEGIN
        INSERT INTO audit VALUES(NEW.id, CASE WHEN NEW.id = 2 THEN 'it''s;two' ELSE 'one' END);
        -- a fake terminator: ; END;
        INSERT INTO scratch VALUES(NEW.id);
      END;
      INSERT INTO data VALUES(1, 'x;'), (2, 'y;');
      COMMIT;
      INSERT INTO audit SELECT sum(id), 'session' FROM scratch;
    "#,
    );
    // The quoted value also crosses an input boundary inside a statement.
    sql = sql.replace(
        "'x;'",
        &format!("'{}x;'", "a;''".repeat(reader::READ_BYTES)),
    );
    tokio::fs::write(&path, &sql).await.unwrap();
    let (file, info, sample) = preview_file(&path).await.unwrap();
    let size = info.len();
    assert_eq!(sample.len(), PREVIEW_BYTES);
    assert_eq!(size, sql.len() as u64);
    let (runtime, id) = new_job();
    run_file(&pool, file, size, runtime.clone(), &id)
        .await
        .unwrap();
    let rows: Vec<(i64, String)> = sqlx::query_as("SELECT id,txt FROM audit ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(
        rows,
        vec![
            (1, "one".into()),
            (2, "it's;two".into()),
            (3, "session".into())
        ]
    );
    let record = runtime.get(&id).unwrap();
    assert_eq!(record.status, JobStatus::Succeeded);
    assert_eq!(record.progress.completed, size);
    assert!(record
        .logs
        .last()
        .unwrap()
        .message
        .contains("8 statements completed"));
    tokio::fs::remove_file(path).await.unwrap();
}

#[tokio::test]
async fn sqlite_file_errors_keep_commits_and_report_the_failed_statement() {
    let pool = test_pool().await;
    sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        .execute(&pool)
        .await
        .unwrap();
    let sql = "BEGIN;INSERT INTO t VALUES(1);COMMIT;\nBEGIN;INSERT INTO t VALUES(2);\nINSERT INTO t VALUES(2);INSERT INTO t VALUES(3);";
    let (runtime, id) = new_job();
    let error = run_file(
        &pool,
        sql.as_bytes(),
        sql.len() as u64,
        runtime.clone(),
        &id,
    )
    .await
    .unwrap_err();
    assert!(error.message.contains("Statement 6 at line 3"), "{error}");
    assert!(error.message.contains("5 statements completed"));
    let record = runtime.get(&id).unwrap();
    assert_eq!(record.status, JobStatus::Failed);
    assert_eq!(
        record.progress.completed as usize,
        sql.find("\nINSERT INTO t VALUES(2);").unwrap()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT id FROM t")
            .fetch_all(&pool)
            .await
            .unwrap(),
        vec![1]
    );

    let (runtime, id) = new_job();
    let sql = "BEGIN; INSERT INTO t VALUES (4)";
    assert!(
        run_file(&pool, sql.as_bytes(), sql.len() as u64, runtime, &id)
            .await
            .unwrap_err()
            .message
            .contains("open transaction")
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT id FROM t")
            .fetch_all(&pool)
            .await
            .unwrap(),
        vec![1]
    );
}

#[tokio::test]
async fn sqlite_file_cancel_interrupts_running_sql_and_rolls_back_open_work() {
    let pool = test_pool().await;
    sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        .execute(&pool)
        .await
        .unwrap();
    let sql = "INSERT INTO t VALUES(1);BEGIN;INSERT INTO t VALUES(2);WITH RECURSIVE seq(n) AS (VALUES(0) UNION ALL SELECT n+1 FROM seq WHERE n<1000000000) SELECT sum(n) FROM seq;COMMIT;INSERT INTO t VALUES(3);";
    let (runtime, id) = new_job();
    let worker = {
        let pool = pool.clone();
        let runtime = runtime.clone();
        let id = id.clone();
        tokio::spawn(async move {
            run_file(&pool, sql.as_bytes(), sql.len() as u64, runtime, &id).await
        })
    };
    let completed = sql.find("WITH RECURSIVE").unwrap() as u64;
    tokio::time::timeout(Duration::from_secs(5), async {
        while runtime.get(&id).unwrap().progress.completed < completed {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("third statement completed");
    runtime.request_cancel(&id).unwrap();
    tokio::time::timeout(Duration::from_secs(5), worker)
        .await
        .expect("SQLite interrupted")
        .unwrap()
        .unwrap();
    let record = runtime.get(&id).unwrap();
    assert_eq!(record.status, JobStatus::Cancelled);
    assert_eq!(record.progress.completed, completed);
    assert!(record
        .logs
        .last()
        .unwrap()
        .message
        .contains("3 statements completed"));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT id FROM t")
            .fetch_all(&pool)
            .await
            .unwrap(),
        vec![1]
    );
}

#[tokio::test]
async fn sqlite_file_oversized_statement_stops_before_later_sql() {
    let pool = test_pool().await;
    let sql = format!(
        "CREATE TABLE t(id); SELECT '{}'; INSERT INTO t VALUES(1);",
        "x".repeat(super::super::MAX_SQL_BYTES)
    );
    let (runtime, id) = new_job();
    let error = run_file(&pool, sql.as_bytes(), sql.len() as u64, runtime, &id)
        .await
        .unwrap_err();
    assert!(error.message.contains("split the statement"), "{error}");
    assert!(error.message.contains("1 statement completed"), "{error}");
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM t")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}

async fn connect(db: &DbState, read_only: bool) {
    let profile: ConnectionProfile = serde_json::from_value(serde_json::json!({
        "id": "file-target", "engine": "sqlite", "database": ":memory:", "readOnly": read_only
    }))
    .unwrap();
    connect_impl(db, &SecurityState::default(), None, profile)
        .await
        .unwrap();
}

#[tokio::test]
async fn sqlite_file_rejects_read_only_and_reconnected_targets_and_consumes_grants_once() {
    let db = DbState::default();
    let files = SqlFileState::default();
    let jobs = JobState::default();
    connect(&db, true).await;
    assert!(target(&db, "file-target").await.is_err());
    connect(&db, false).await;
    let connection = target(&db, "file-target").await.unwrap();
    let path = file_path("selection.sql");
    tokio::fs::write(&path, "CREATE TABLE t(id);")
        .await
        .unwrap();
    let picked = prepare_selection(&files, connection, "file-target".into(), &path)
        .await
        .unwrap();
    connect(&db, false).await;
    let error = finish_selection(
        &db,
        &files,
        &jobs,
        "file-target".into(),
        &picked.token,
        true,
    )
    .await
    .unwrap_err();
    assert!(error.message.contains("connection changed"));
    assert!(finish_selection(
        &db,
        &files,
        &jobs,
        "file-target".into(),
        &picked.token,
        true
    )
    .await
    .unwrap_err()
    .message
    .contains("expired"));
    assert!(jobs.runtime().list().history.is_empty());
    let result = run_query_impl(
        &db,
        "file-target".into(),
        "SELECT count(*) FROM sqlite_schema WHERE name='t'".into(),
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.rows[0][0], serde_json::json!(0));
    tokio::fs::remove_file(path).await.unwrap();
}

#[tokio::test]
async fn sqlite_file_starts_only_the_reviewed_file_and_reports_history() {
    let db = DbState::default();
    let files = SqlFileState::default();
    let jobs = JobState::default();
    connect(&db, false).await;
    let connection = target(&db, "file-target").await.unwrap();
    let path = file_path("run.sql");
    tokio::fs::write(&path, "CREATE TABLE old(id);")
        .await
        .unwrap();
    let picked = prepare_selection(&files, connection.clone(), "file-target".into(), &path)
        .await
        .unwrap();
    let sql = "CREATE TABLE reviewed(id); INSERT INTO reviewed VALUES(42);";
    tokio::fs::write(&path, sql).await.unwrap();
    let error = finish_selection(
        &db,
        &files,
        &jobs,
        "file-target".into(),
        &picked.token,
        true,
    )
    .await
    .unwrap_err();
    assert!(error.message.contains("changed after preview"), "{error}");
    assert!(jobs.runtime().list().active.is_empty());
    assert!(jobs.runtime().list().history.is_empty());

    let picked = prepare_selection(&files, connection.clone(), "file-target".into(), &path)
        .await
        .unwrap();
    assert_eq!(picked.preview, sql);
    let id = finish_selection(
        &db,
        &files,
        &jobs,
        "file-target".into(),
        &picked.token,
        true,
    )
    .await
    .unwrap()
    .unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        while jobs.runtime().list().history.is_empty() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("job finished");
    let job = jobs.runtime().get(&id).unwrap();
    assert_eq!(job.status, JobStatus::Succeeded, "{:?}", job.error);
    assert_eq!(job.progress.completed, sql.len() as u64);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT id FROM reviewed")
            .fetch_one(connection.sql_file_pool().unwrap())
            .await
            .unwrap(),
        42
    );
    tokio::fs::remove_file(path).await.unwrap();
}
