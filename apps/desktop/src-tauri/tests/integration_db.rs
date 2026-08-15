//! Real-database integration tests against the Docker `samples` stack.
//!
//! Skipped unless the matching `IRODORI_*` environment variable is set. Run one
//! engine through the root harness with `task db-verify DB=postgres`, or keep it
//! running for manual checks with `task db-up DB=postgres`.
//!
//! Queries stay within sqlx `Any`'s supported types (int, bigint, text). Rich
//! type coverage (decimal, timestamp, json, bytea) needs the per-engine native
//! pools tracked in the roadmap — see https://irodori-table.github.io/irodori-docs/roadmap-1.0.html.

use desktop_lib::db::{
    connect_impl, list_objects_impl, run_query_impl, ConnectionProfile, DbEngine, DbState,
};
use desktop_lib::security::SecurityState;

fn url_profile(id: &str, engine: DbEngine, url: String) -> ConnectionProfile {
    ConnectionProfile {
        id: id.to_string(),
        engine,
        host: None,
        port: None,
        user: None,
        password: None,
        database: None,
        socket_path: None,
        url: Some(url),
        transport: None,
        read_only: false,
        options: Default::default(),
    }
}

async fn exercise(engine: DbEngine, url: String) {
    let state = DbState::default();
    let info = connect_impl(
        &state,
        &SecurityState::default(),
        None,
        url_profile("it", engine, url),
    )
    .await
    .expect("connect to sample db");
    assert_eq!(info.engine, engine);
    assert!(!info.server_version.is_empty(), "server version present");
    eprintln!("connected: {engine:?} {}", info.server_version);

    // samples/<engine>/01_samples.sql seeds a few hundred customers. The exact
    // number is a property of the sample generator and is allowed to change, so
    // this asserts the table is populated rather than pinning a count — a pinned
    // count only ever fails for the wrong reason.
    let count = run_query_impl(
        &state,
        "it".into(),
        "select count(*) as n from customers".into(),
        None,
    )
    .await
    .expect("count customers");
    assert_eq!(count.columns, vec!["n"]);
    let n = count.rows[0][0]
        .as_i64()
        .or_else(|| count.rows[0][0].as_str().and_then(|s| s.parse().ok()));
    assert!(
        n.is_some_and(|n| n >= 100),
        "expected the seeded customers table to be populated, got {n:?}"
    );

    let metadata = list_objects_impl(&state, "it".into())
        .await
        .expect("object metadata");
    assert!(
        metadata
            .schemas
            .iter()
            .flat_map(|schema| schema.objects.iter())
            .any(|object| {
                object.name == "customers"
                    && object
                        .columns
                        .iter()
                        .any(|column| column.name.eq_ignore_ascii_case("name"))
            }),
        "customers table with name column should be visible in metadata: {:?}",
        metadata
    );

    if engine == DbEngine::Postgres {
        assert!(
            metadata
                .schemas
                .iter()
                .flat_map(|schema| schema.objects.iter())
                .any(|object| object.name == "cheeses"),
            "Postgres sample should include the richer cheese demo tables: {:?}",
            metadata
        );
        let cheese_join = run_query_impl(
            &state,
            "it".into(),
            "select cheeses.name as cheese, countries.name as country \
             from cheeses join countries on cheeses.origin_country_id = countries.id \
             order by cheeses.id"
                .into(),
            None,
        )
        .await
        .expect("cheese demo join");
        assert_eq!(cheese_join.columns, vec!["cheese", "country"]);
        assert_eq!(cheese_join.row_count, 5, "expected 5 seeded cheeses");
    }

    // Join that returns only Any-supported types (text + bigint).
    let join = run_query_impl(
        &state,
        "it".into(),
        "select c.name, count(o.id) as orders from customers c \
         join orders o on o.customer_id = c.id group by c.name order by c.name"
            .into(),
        None,
    )
    .await
    .expect("join query");
    assert_eq!(join.columns, vec!["name", "orders"]);
    assert!(join.row_count >= 1, "join returns rows");

    // Rich types now decode correctly (the sqlx-`Any` gap is closed): a decimal
    // column becomes an exact string and a timestamp a string, instead of erroring.
    let rich = run_query_impl(
        &state,
        "it".into(),
        "select total, ordered_at from orders order by id limit 1".into(),
        None,
    )
    .await
    .expect("rich types");
    assert_eq!(rich.columns, vec!["total", "ordered_at"]);
    assert!(
        rich.rows[0][0].is_string(),
        "decimal -> string, got {:?}",
        rich.rows[0][0]
    );
    assert!(
        rich.rows[0][1].is_string(),
        "timestamp -> string, got {:?}",
        rich.rows[0][1]
    );
    eprintln!(
        "rich types: total={} ordered_at={}",
        rich.rows[0][0], rich.rows[0][1]
    );

    // Postgres-only: a jsonb column round-trips as a JSON object (skipped on MySQL,
    // whose sample `events` table has no payload column).
    if let Ok(j) = run_query_impl(
        &state,
        "it".into(),
        "select payload from events limit 1".into(),
        None,
    )
    .await
    {
        assert!(
            j.rows.is_empty() || j.rows[0][0].is_object(),
            "jsonb -> object, got {:?}",
            j.rows.first()
        );
    }

    // If the bulk `events` table exists (10M rows), a full unbounded scan must
    // stay light: the stream stops at the default page cap instead of buffering
    // every row. This is the anti-"TablePlus eats all memory" guarantee.
    if let Ok(scan) = run_query_impl(
        &state,
        "it".into(),
        "select id, user_id, kind from events".into(),
        None,
    )
    .await
    {
        assert_eq!(scan.row_count, 10_000, "capped at the default page size");
        assert!(scan.truncated, "truncated flag set when more rows remain");
        eprintln!(
            "events full scan capped at {} rows (truncated={}) in {} ms",
            scan.row_count, scan.truncated, scan.elapsed_ms
        );
    }
    // Pools close when `state` drops at end of scope.
}

#[test]
fn postgres_samples() {
    let Ok(url) = std::env::var("IRODORI_PG_URL") else {
        eprintln!("skip: IRODORI_PG_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(exercise(DbEngine::Postgres, url));
}

#[test]
fn mysql_samples() {
    let Ok(url) = std::env::var("IRODORI_MYSQL_URL") else {
        eprintln!("skip: IRODORI_MYSQL_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(exercise(DbEngine::Mysql, url));
}

/// Lighter check (connect + `select 1`) for wire-compatible engines we route
/// through the existing postgres/mysql drivers, no seed required.
async fn connect_only(engine: DbEngine, url: String) {
    let state = DbState::default();
    let info = connect_impl(
        &state,
        &SecurityState::default(),
        None,
        url_profile("it", engine, url),
    )
    .await
    .expect("connect");
    assert_eq!(info.engine, engine);
    assert!(!info.server_version.is_empty());
    eprintln!("connected: {engine:?} {}", info.server_version);
    let one = run_query_impl(&state, "it".into(), "select 1 as one".into(), None)
        .await
        .expect("select 1");
    assert_eq!(one.columns, vec!["one"]);
}

#[test]
fn cockroachdb_connect() {
    let Ok(url) = std::env::var("IRODORI_CRDB_URL") else {
        eprintln!("skip: IRODORI_CRDB_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(connect_only(DbEngine::CockroachDb, url));
}

#[test]
fn mariadb_connect() {
    let Ok(url) = std::env::var("IRODORI_MARIADB_URL") else {
        eprintln!("skip: IRODORI_MARIADB_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(connect_only(DbEngine::MariaDb, url));
}

/// SQL Server via the pure-Rust tiberius driver. `IRODORI_MSSQL_URL` is an ADO
/// string, e.g. `server=tcp:localhost,11433;User Id=sa;Password=...;TrustServerCertificate=true`.
async fn exercise_mssql(url: String) {
    let state = DbState::default();
    let info = connect_impl(
        &state,
        &SecurityState::default(),
        None,
        url_profile("it", DbEngine::SqlServer, url),
    )
    .await
    .expect("connect");
    assert_eq!(info.engine, DbEngine::SqlServer);
    assert!(!info.server_version.is_empty());
    eprintln!("connected: SqlServer {}", info.server_version);

    // Self-contained: a VALUES table constructor avoids temp tables (tiberius
    // sends via sp_executesql, which scopes #temp tables away).
    let r = run_query_impl(
        &state,
        "it".into(),
        "select a, b from (values (1, cast('hi' as nvarchar(50))), \
         (2, cast(null as nvarchar(50)))) v(a, b) order by a"
            .into(),
        None,
    )
    .await
    .expect("select");
    assert_eq!(r.columns, vec!["a", "b"]);
    assert_eq!(r.row_count, 2);
    assert_eq!(r.rows[0][0], serde_json::json!(1));
    assert_eq!(r.rows[0][1], serde_json::json!("hi"));
    assert_eq!(r.rows[1][1], serde_json::Value::Null);

    // Precision-safe decoding off the raw ColumnData: exact numerics keep their
    // display scale as strings, temporals render via chrono, binary is `\x` hex.
    let typed = run_query_impl(
        &state,
        "it".into(),
        "select cast(1234.50 as decimal(10,2)) as dec, \
         cast('2024-01-02T03:04:05' as datetime2) as ts, \
         cast('2024-01-02' as date) as d, \
         cast(0x0102 as varbinary(8)) as bin"
            .into(),
        None,
    )
    .await
    .expect("typed select");
    assert_eq!(typed.rows[0][0], serde_json::json!("1234.50"));
    assert_eq!(typed.rows[0][1], serde_json::json!("2024-01-02 03:04:05"));
    assert_eq!(typed.rows[0][2], serde_json::json!("2024-01-02"));
    assert_eq!(typed.rows[0][3], serde_json::json!("\\x0102"));

    run_query_impl(
        &state,
        "it".into(),
        "if object_id('dbo.irodori_meta_orders', 'U') is not null \
         drop table dbo.irodori_meta_orders"
            .into(),
        None,
    )
    .await
    .expect("drop old metadata child fixture");
    run_query_impl(
        &state,
        "it".into(),
        "if object_id('dbo.irodori_meta_customers', 'U') is not null \
         drop table dbo.irodori_meta_customers"
            .into(),
        None,
    )
    .await
    .expect("drop old metadata fixture");
    run_query_impl(
        &state,
        "it".into(),
        "create table dbo.irodori_meta_customers \
         (id int not null primary key, name nvarchar(100) not null)"
            .into(),
        None,
    )
    .await
    .expect("create metadata fixture");
    run_query_impl(
        &state,
        "it".into(),
        "create table dbo.irodori_meta_orders \
         (id int not null primary key, customer_id int not null, \
          constraint fk_irodori_meta_orders_customer foreign key (customer_id) \
          references dbo.irodori_meta_customers(id))"
            .into(),
        None,
    )
    .await
    .expect("create metadata child fixture");
    run_query_impl(
        &state,
        "it".into(),
        "create index irodori_meta_customers_name_idx \
         on dbo.irodori_meta_customers(name)"
            .into(),
        None,
    )
    .await
    .expect("create metadata fixture index");
    let metadata = list_objects_impl(&state, "it".into())
        .await
        .expect("metadata");
    assert!(
        metadata
            .schemas
            .iter()
            .flat_map(|schema| schema.objects.iter())
            .any(|object| {
                object.name == "irodori_meta_customers"
                    && object.columns.iter().any(|column| column.name == "name")
                    && object
                        .indexes
                        .iter()
                        .any(|index| index.name == "irodori_meta_customers_name_idx")
            }),
        "SQL Server metadata should include fixture table: {:?}",
        metadata
    );
    let order = metadata
        .schemas
        .iter()
        .flat_map(|schema| schema.objects.iter())
        .find(|object| object.name == "irodori_meta_orders")
        .expect("SQL Server metadata should include child table");
    assert_eq!(
        order.foreign_keys.len(),
        1,
        "SQL Server FK metadata: {order:?}"
    );
    assert_eq!(order.foreign_keys[0].columns, vec!["customer_id"]);
    assert_eq!(
        order.foreign_keys[0].references_schema.as_deref(),
        Some("dbo")
    );
    assert_eq!(
        order.foreign_keys[0].references_table,
        "irodori_meta_customers"
    );
    assert_eq!(order.foreign_keys[0].references_columns, vec!["id"]);
    run_query_impl(
        &state,
        "it".into(),
        "drop table dbo.irodori_meta_orders".into(),
        None,
    )
    .await
    .expect("drop metadata child fixture");
    run_query_impl(
        &state,
        "it".into(),
        "drop table dbo.irodori_meta_customers".into(),
        None,
    )
    .await
    .expect("drop metadata fixture");
}

#[test]
fn sqlserver_samples() {
    let Ok(url) = std::env::var("IRODORI_MSSQL_URL") else {
        eprintln!("skip: IRODORI_MSSQL_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(exercise_mssql(url));
}

// TimescaleDB is Postgres-wire and seeded with the Postgres sample schema.
#[test]
fn timescaledb_samples() {
    let Ok(url) = std::env::var("IRODORI_TIMESCALE_URL") else {
        eprintln!("skip: IRODORI_TIMESCALE_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(exercise(DbEngine::Timescale, url));
}

#[test]
fn yugabytedb_connect() {
    let Ok(url) = std::env::var("IRODORI_YUGABYTE_URL") else {
        eprintln!("skip: IRODORI_YUGABYTE_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(connect_only(DbEngine::YugabyteDb, url));
}

#[test]
fn tidb_connect() {
    let Ok(url) = std::env::var("IRODORI_TIDB_URL") else {
        eprintln!("skip: IRODORI_TIDB_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(connect_only(DbEngine::TiDb, url));
}

/// MongoDB through the same `Connection` trait: connect, version, and a
/// collection "query" projected to a table.
async fn exercise_mongo(url: String) {
    let state = DbState::default();
    let info = connect_impl(
        &state,
        &SecurityState::default(),
        None,
        url_profile("it", DbEngine::Mongo, url),
    )
    .await
    .expect("connect");
    assert_eq!(info.engine, DbEngine::Mongo);
    assert!(!info.server_version.is_empty());
    eprintln!("connected: {}", info.server_version);

    let r = run_query_impl(&state, "it".into(), "customers".into(), None)
        .await
        .expect("find customers");
    assert_eq!(r.row_count, 4, "4 seeded customers");
    assert!(
        r.columns.iter().any(|c| c == "name"),
        "columns: {:?}",
        r.columns
    );

    let metadata = list_objects_impl(&state, "it".into())
        .await
        .expect("metadata");
    assert!(
        metadata
            .schemas
            .iter()
            .flat_map(|schema| schema.objects.iter())
            .any(|object| {
                object.name == "customers"
                    && object.columns.iter().any(|column| column.name == "name")
            }),
        "MongoDB metadata should include customers.name: {:?}",
        metadata
    );
}

#[test]
fn mongo_samples() {
    let Ok(url) = std::env::var("IRODORI_MONGO_URL") else {
        eprintln!("skip: IRODORI_MONGO_URL not set");
        return;
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(exercise_mongo(url));
}

/// Oracle via the pure-Rust thin driver (no Instant Client). Structured profile
/// — Oracle's `database` field is the service name.
async fn exercise_oracle(profile: ConnectionProfile) {
    let state = DbState::default();
    let info = connect_impl(&state, &SecurityState::default(), None, profile)
        .await
        .expect("connect");
    assert_eq!(info.engine, DbEngine::Oracle);
    assert!(!info.server_version.is_empty());
    eprintln!("connected: Oracle {}", info.server_version);

    let r = run_query_impl(
        &state,
        "it".into(),
        "select id, name from customers order by id".into(),
        None,
    )
    .await
    .expect("query customers");
    assert_eq!(r.row_count, 4, "4 seeded customers");
    assert!(
        r.columns.iter().any(|c| c.eq_ignore_ascii_case("name")),
        "columns: {:?}",
        r.columns
    );
    // Oracle NUMBER decodes precision-safe (as a string here); accept any
    // representation of 1.
    let first = &r.rows[0][0];
    let is_one =
        first.as_i64() == Some(1) || first.as_f64() == Some(1.0) || first.as_str() == Some("1");
    assert!(is_one, "first id should be 1, got {first:?}");

    let metadata = list_objects_impl(&state, "it".into())
        .await
        .expect("metadata");
    assert!(
        metadata
            .schemas
            .iter()
            .flat_map(|schema| schema.objects.iter())
            .any(|object| {
                object.name.eq_ignore_ascii_case("CUSTOMERS")
                    && object
                        .columns
                        .iter()
                        .any(|column| column.name.eq_ignore_ascii_case("NAME"))
            }),
        "Oracle metadata should include CUSTOMERS.NAME: {:?}",
        metadata
    );
    let order = metadata
        .schemas
        .iter()
        .flat_map(|schema| schema.objects.iter())
        .find(|object| object.name.eq_ignore_ascii_case("ORDERS"))
        .expect("Oracle metadata should include ORDERS");
    assert_eq!(order.foreign_keys.len(), 1, "Oracle FK metadata: {order:?}");
    assert_eq!(
        order.foreign_keys[0]
            .columns
            .iter()
            .map(|column| column.to_ascii_uppercase())
            .collect::<Vec<_>>(),
        vec!["CUSTOMER_ID"]
    );
    assert_eq!(
        order.foreign_keys[0].references_table.to_ascii_uppercase(),
        "CUSTOMERS"
    );
    assert_eq!(
        order.foreign_keys[0]
            .references_columns
            .iter()
            .map(|column| column.to_ascii_uppercase())
            .collect::<Vec<_>>(),
        vec!["ID"]
    );
}

#[test]
fn oracle_samples() {
    if std::env::var("IRODORI_ORACLE").is_err() {
        eprintln!("skip: IRODORI_ORACLE not set");
        return;
    }
    let env = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
    let profile = ConnectionProfile {
        id: "it".into(),
        engine: DbEngine::Oracle,
        host: Some(env("IRODORI_ORACLE_HOST", "localhost")),
        port: Some(env("IRODORI_ORACLE_PORT", "55521").parse().unwrap_or(55521)),
        user: Some(env("IRODORI_ORACLE_USER", "irodori")),
        password: Some(env("IRODORI_ORACLE_PASSWORD", "irodori")),
        database: Some(env("IRODORI_ORACLE_SERVICE", "FREEPDB1")),
        socket_path: None,
        url: None,
        transport: None,
        read_only: false,
        options: Default::default(),
    };
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(exercise_oracle(profile));
}

/// A profile configured through the connection *form* rather than a URL — host,
/// port, credentials, and connector options — which is the path
/// `db::engine::build_tcp_url` composes and the only one a user can reach
/// without hand-writing a DSN.
fn field_profile(
    id: &str,
    engine: DbEngine,
    user: Option<&str>,
    password: Option<&str>,
    options: &[(&str, &str)],
) -> ConnectionProfile {
    ConnectionProfile {
        id: id.to_string(),
        engine,
        host: Some(std::env::var("IRODORI_TLS_HOST").unwrap_or_else(|_| "localhost".to_string())),
        port: Some(
            std::env::var("IRODORI_TLS_PORT")
                .ok()
                .and_then(|port| port.parse().ok())
                .unwrap_or(55433),
        ),
        user: user.map(str::to_string),
        password: password.map(str::to_string),
        database: Some("samples".to_string()),
        socket_path: None,
        url: None,
        transport: None,
        read_only: false,
        options: options
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
    }
}

/// Set to the directory holding `ca.crt`, `client.crt`, and `client.key` —
/// `tls/certs` in irodori-samples after `sh tls/generate-certs.sh`.
fn tls_cert_dir() -> Option<String> {
    std::env::var("IRODORI_TLS_CERTS")
        .ok()
        .filter(|dir| !dir.is_empty())
}

async fn connects(profile: ConnectionProfile) -> Result<String, String> {
    let state = DbState::default();
    connect_impl(&state, &SecurityState::default(), None, profile)
        .await
        .map(|info| info.server_version)
        .map_err(|error| error.to_string())
}

#[tokio::test]
async fn postgres_tls_modes_reach_a_tls_only_server() {
    let Some(certs) = tls_cert_dir() else {
        eprintln!("skipping: set IRODORI_TLS_CERTS to the samples tls/certs directory");
        return;
    };
    let ca = format!("{certs}/ca.crt");

    // 1. The server refuses plaintext, so `sslmode=disable` must fail. Without
    //    this the rest proves nothing: a server that also accepts plaintext
    //    would let every mode "succeed" whether or not TLS was negotiated.
    let plaintext = connects(field_profile(
        "tls-disable",
        DbEngine::Postgres,
        Some("irodori"),
        Some("irodori"),
        &[("sslMode", "disable")],
    ))
    .await;
    assert!(
        plaintext.is_err(),
        "a TLS-only server accepted a plaintext connection: {plaintext:?}"
    );

    // 2. `verify-full` against the issuing CA: the strongest mode, checking both
    //    the chain and the hostname.
    let verified = connects(field_profile(
        "tls-verify-full",
        DbEngine::Postgres,
        Some("irodori"),
        Some("irodori"),
        &[("sslMode", "verify-full"), ("sslRootCert", &ca)],
    ))
    .await
    .expect("verify-full with the issuing CA should connect");
    assert!(!verified.is_empty(), "server version present");
    eprintln!("connected over verify-full: {verified}");

    // 3. `verify-full` *without* the CA must fail — the certificate is not
    //    signed by anything in the system trust store. This is what proves the
    //    root certificate is actually being used rather than ignored.
    let unverified = connects(field_profile(
        "tls-verify-full-no-ca",
        DbEngine::Postgres,
        Some("irodori"),
        Some("irodori"),
        &[("sslMode", "verify-full")],
    ))
    .await;
    assert!(
        unverified.is_err(),
        "verify-full accepted a certificate with no trusted CA: {unverified:?}"
    );
}

#[tokio::test]
async fn postgres_client_certificate_authenticates_without_a_password() {
    let Some(certs) = tls_cert_dir() else {
        eprintln!("skipping: set IRODORI_TLS_CERTS to the samples tls/certs directory");
        return;
    };

    // No password anywhere: the identity comes from the certificate's subject,
    // which the sample container maps to the `irodori_cert` role.
    let version = connects(field_profile(
        "tls-client-cert",
        DbEngine::Postgres,
        Some("irodori_cert"),
        None,
        &[
            ("sslMode", "verify-full"),
            ("sslRootCert", &format!("{certs}/ca.crt")),
            ("sslCert", &format!("{certs}/client.crt")),
            ("sslKey", &format!("{certs}/client.key")),
        ],
    ))
    .await
    .expect("client certificate should authenticate");
    assert!(!version.is_empty(), "server version present");
    eprintln!("connected by client certificate: {version}");
}
