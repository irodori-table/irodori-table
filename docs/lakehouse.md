# Lakehouse connections

Iceberg, Delta Lake, Hudi, Hive, Athena, S3 Tables, Databricks, DuckDB, and
MotherDuck are **extension-first**: the core desktop build has no driver for any
of them. Nothing works until the matching connector extension is installed, and
the connection dialog will not tell you that until you try to connect.

This page is the whole path, in order.

## Step 1 — install the connector extension

1. Open **Settings ▸ Extensions**. Reachable from **Tools ▸ Open Extensions**,
   from the command palette as **Open Extensions**, or from **Settings** (the
   gear, `Mod+,`) by choosing the Extensions tab.
2. The tab lists **Installed**, **Marketplace**, and **Recommended**. Use
   **Search Extensions in Marketplace** to find the one you need.
3. Press **Install** on the matching connector and confirm the **Install
   {name}?** dialog.

Each engine maps to exactly one extension id:

| Engine | Extension id |
| --- | --- |
| Apache Iceberg | `irodori.iceberg` |
| Delta Lake | `irodori.delta-lake` |
| Apache Hudi | `irodori.hudi` |
| Apache Hive | `irodori.hive` |
| Amazon Athena | `irodori.athena` |
| AWS S3 Tables | `irodori.s3-tables` |
| Databricks / Spark SQL | `irodori.databricks` |
| Trino / Presto | `irodori.trino-presto` |
| DuckDB | `irodori.duckdb` |
| MotherDuck | `irodori.motherduck` |

If you skip this step, **Connect** fails with:

> This data source needs the `irodori.iceberg` connector extension. Install it
> from Extensions, then try again. Build availability: …

That message is the intended signal. Note that the connection form itself gives
no earlier warning — the engine appears in the dropdown, the fields fill in, and
**Test** and **Connect** stay enabled right up to the point of failure. See
[Extensions](extensions.md) for how installation, platform targets, and checksum
verification work.

## Step 2 — create the profile

**File ▸ Open Connection Manager**, then the **+** button above the profile
list. Give it a **Connection name** and pick the engine.

After the extension is installed, the form re-shapes itself from that
extension's connection model. For **Iceberg**, the current model exposes:

| Field | Notes |
| --- | --- |
| **Catalog type** | REST by default |
| **Catalog URI** | For example `https://catalog.example.com/v1` |
| **Warehouse path** | For example `s3://bucket/warehouse` |
| **Table identifier** | Namespace and table name |
| **Storage backend**, **Cloud region**, **Credential vending** | Backend-specific endpoint settings |

Choose an **Authentication method** to reveal only that method's fields. For
OAuth2 this includes access/refresh tokens, client ID, session-only client
secret, token endpoint, and scope. AWS, Google, Azure, catalog-token, and
custom-driver choices likewise come directly from the installed connector
version. TLS mode and certificate inputs come from the same model.

There is no second hardcoded Iceberg field list in the app. A connector update
can add, remove, or relabel fields without a desktop release. Values are sent
under the model's exact, case-sensitive bindings.

Switching to URL mode instead uses the connector's connection-string field; its
label and accepted DSN/path forms come from the installed connector version.

The other lakehouse engines publish their own models and therefore differ:

- **Athena** and **S3 Tables** declare cloud-resource/custom-endpoint modes plus
  their AWS authentication choices.
- **Hive** declares catalog, object-storage, JDBC, and connection-string modes.
- **Databricks** declares its endpoint and Databricks-specific token/OAuth
  methods.
- **MotherDuck** declares MotherDuck service, local-file, in-memory, and
  connection-string modes.

### What connector settings actually are

**Connector settings** is not decoration. Public values are stored on the
profile as an `options` map and forwarded verbatim, so keys must match what the
connector reads. Secret fields use a transient draft map and are merged only
for a connection attempt; persistence and export strip that map entirely.

## Step 3 — test and connect

**Test** validates without opening a session; **Connect** opens it. On success
the object browser populates from the connector's own metadata response —
catalogs and namespaces arrive as schemas, tables and views as objects.

Remember that connection passwords are session-only. The access key and secret
are cleared from storage when the app closes and must be re-entered next launch.
See [Connections](connections.md).

## The Lakehouse side panel is not a catalog browser

There is a **Lakehouse** panel in the sidebar. Despite appearances it does not
browse anything and makes no backend calls at all. It is a **SQL snippet
clipboard** with five fixed entries:

| Entry | What it pastes |
| --- | --- |
| **DuckDB Iceberg** | `INSTALL httpfs; INSTALL iceberg;` … `iceberg_scan('s3://…')` |
| **REST Catalog** | `CREATE SECRET … (TYPE iceberg …)` plus `ATTACH … (TYPE iceberg)` |
| **MotherDuck** | `INSTALL motherduck; ATTACH 'md:' AS md;` |
| **Athena** | A commented profile checklist and a `SELECT … LIMIT 100` |
| **Maintenance** | Commented `OPTIMIZE` / `VACUUM` / `expire_snapshots` reminders |

Each has **Load** (replaces the active editor tab), **Insert** (inserts at the
cursor), and a copy button. Right-clicking gives the same three actions. The
order of the five changes with the active engine; the content never does.

The panel also shows a status line — **connected** / **not connected** and an
object count — and a **Catalog** list of up to six schema names. Both are read
off metadata the connection already loaded for the object browser. Nothing in the
panel queries the catalog, refreshes, or drills down.

Treat the snippets as templates: they contain placeholder buckets, table names,
and credentials that you must edit before running.

## Gaps

- **No pre-connect warning for a missing connector.** The engine is selectable
  and the form is fully interactive; the failure only arrives at **Connect**.
- **The Lakehouse panel is static.** No catalog browsing, no namespace
  expansion, no snapshot/branch inspection, no table-format metadata — despite
  the `lakehouse` source-type contract in the extension catalog declaring
  catalog browsing, table-format metadata, execution-backend selection, and
  catalog credentials as workflows.
- **The Lakehouse panel is not translated.** Its strings — **Lakehouse**,
  **connected**, **no catalog loaded**, **Load**, **Insert** — are hardcoded
  English and stay English under the Japanese locale.
- **Declared does not always mean implemented yet.** Shared extension CI
  ratchets known auth-method and field-binding gaps so they cannot grow, but
  existing baseline entries remain connector backlog until implemented or
  removed from the manifest.
- **Table maintenance is documentation, not a feature.** The **Maintenance**
  snippet is a comment block; there are no compaction, snapshot-expiry, or
  retention actions in the UI.
