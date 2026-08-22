# Connections

Connection profiles are managed in one dialog: **File ▸ Open Connection
Manager**, or **Open Connection Manager** from the command palette
(`Mod+Shift+P`). No default keyboard shortcut is bound to it.

## The dialog

The left column lists saved profiles, grouped and searchable. The right column
is the form for whichever profile is selected. The footer holds the actions.

| Footer button | Effect |
| --- | --- |
| **Delete** | Removes the selected profile, or all selected profiles when several are picked |
| **Disconnect** | Closes the active session; disabled when nothing is connected |
| **Save** | Stores the profile without connecting |
| **Test** | Validates the profile against the server without opening a session |
| **Connect** | Opens the session and loads the object browser |

**Test** and **Connect** are disabled when the selected engine is not available
in the running build — see [Engine availability](#engine-availability).

### Profile list

- **Search connections** filters by name.
- Profiles are grouped by environment inferred from the name: **PRD /
  Production**, **STG / Staging**, **DEV / Development**, **Local**, **Other**.
  Group headers show `{connected} connected · {total} total`. Groups collapse.
- Click selects. `Shift`+click selects a range across expanded groups,
  `Ctrl`/`Cmd`+click toggles one. With several selected, **Delete** becomes
  **Delete selected ({count})**.
- The **+** button in the list header adds a profile.

## The form

Built-in engines use `builtin-engine-connection-config.json`. Installable native
connectors use the `connector.connection` model shipped by that extension, so
endpoint modes, fields, authentication methods, TLS controls, defaults, and
labels can evolve without adding connector-specific settings to the desktop
app. Common to all:

- **Connection name** — free text, used for grouping and for the tab badge.
- **Color tag** — a swatch grid plus a custom hex picker (**More colors**). The
  colour tints the connection's UI so production is visually distinct.
- **Read-only mode** — see below.

Each built-in layout or extension model chooses an input mode:

- **URL / DSN** — one connection string.
- **Fields** — discrete **Host**, **Port**, **User**, **Password**, **Database**
  inputs for built-ins, or the endpoint fields declared by an installed
  connector. Engines hide fields that do not apply.

Examples of the relabelling, all from the shipped config:

| Engine | Host label | Database label |
| --- | --- | --- |
| PostgreSQL | Host | Database |
| SQLite | File | SQLite file / :memory: |
| SQL Server | Server | Database |
| Oracle | Host | Service name / SID |
| Snowflake | Account / host | Database / schema |

A **Transport** row at the bottom of the form states how the connection is made.
Built-ins use their configured label; extensions use the first declared
transport (or their wire identifier when no transport is declared). It is a
readout, not a control.

### Unix sockets

Engines that support socket transport show a **Direct TCP** / **Unix socket**
toggle. Choosing **Unix socket** replaces the host and port inputs with a single
socket-path field.

### Connector settings

Settings outside the standard profile columns appear in a **Connector settings**
block below the main grid. For extensions, the installed model is the sole
source of those fields; the app does not maintain a second per-connector list.
Built-in Snowflake keeps its native settings in the built-in config:

| Engine | Fields |
| --- | --- |
| Snowflake | **Warehouse**, **Role**, **Schema** |

Engines with no declared settings do not grow an empty section. These values are
forwarded under the exact option names declared by the built-in config or
extension model. Secret extension fields remain session-only. See [Lakehouse
connections](lakehouse.md).

### Read-only mode

Ticking **Read-only mode** marks the profile read-only. The connection then
carries a **read-only** badge, grid editing is refused, and the **Import** button
in the results toolbar is disabled with the tooltip **Read-only connection**.

It is a client-side guard on Irodori's own write paths, not a server-side
permission. It does not stop you typing and running `DELETE` in the editor. For
a real guarantee, use a database role with restricted rights.

## Where credentials go

**Connection passwords are not saved.** The password placeholder reads **Session
only** and that is literal: profiles are persisted to browser local storage under
`irodori.connectionProfiles.v1` after being passed through a sanitiser that
blanks the password field, strips `password=` / `pwd=` / `pass=` /
`passphrase=` parameters from connection strings, and clears the userinfo
password from URLs. You re-enter the password each time the app starts.

The same rule applies to extension-declared tokens, private keys, passphrases,
and custom driver options. They live only in the open form and are added to one
connect request; save, import, and export never persist them. Non-secret options
such as a region or warehouse can be saved with the profile.

This is different from the AI provider API key, which *is* written to the OS
keychain — see [AI chat](ai-chat.md).

## Import and export

The **…** button beside the profile search opens **Connection import and
export**.

**Import Connections…** reads a file. **Export {format}** writes one. Eight
formats are supported: **Irodori JSON**, **DBeaver**, **DataGrip**,
**TablePlus**, **pgAdmin**, **MySQL Workbench**, **HeidiSQL**, and
**SQLTools**. Irodori's own export is JSON (`irodori-connections-<timestamp>.json`);
the DBeaver export is CSV.

Exports never contain passwords, for the reason above.

## Engine availability

46 engines are selectable. They reach a database by one of three routes, and the
failure mode differs:

1. **Compiled into this build.** PostgreSQL, MySQL/MariaDB/TiDB, SQLite,
   CockroachDB, YugabyteDB, Redshift, TimescaleDB, Neon, H2, ClickHouse,
   Snowflake, InfluxDB, QuestDB. These work with no extra steps.

2. **Compiled in only when the build enables the optional feature set.** Oracle,
   SQL Server, MongoDB, Neo4j, Redis, Cassandra, ScyllaDB, BigQuery, Bigtable.
   A build without them reports that the data source is not available and links
   to the availability table. Installing the matching native connector supplies
   the missing runtime and enables **Test** and **Connect**.

3. **Provided by a connector extension.** Everything lakehouse, vector, search,
   or document-oriented: DuckDB, MotherDuck, Databricks, Trino/Presto, Firebird,
   Elasticsearch,
   OpenSearch, Couchbase, DynamoDB, ArangoDB, IoTDB, Memgraph, Qdrant, Milvus,
   Pinecone, Cloud Spanner — plus Iceberg, Delta Lake, Hudi, Hive, Athena and S3
   Tables, whose connectors now ship from
   [irodori-lakehouse](https://github.com/irodori-table/irodori-lakehouse).
   Connecting without the extension installed fails
   with:

   > This data source needs the `irodori.<name>` connector extension. Install it
   > from Extensions, then try again.

   Install it from **Settings ▸ Extensions** first — see
   [Extensions](extensions.md).

When an enabled marketplace connector is installed for an engine that also has
a compiled implementation, the connector takes precedence. Its connection model
and its native runtime therefore stay paired; disabling or uninstalling it
returns that engine to the compiled implementation and built-in form.

The authoritative inventory, including which wire each engine speaks and how far
it has been verified, is
[`registry/data-source-support-status.md`](../registry/data-source-support-status.md).

## Starter profiles

The app ships with sample profiles. `sqlite-memory` opens an in-memory SQLite
database seeded with a small `products` / `orders` schema, which is enough to
exercise the editor, results grid, and ERD without any server. There are also
local Postgres and MySQL profiles pointing at the sample containers from the
[`irodori-samples`](https://github.com/irodori-table/irodori-samples) repository
(`task db-up DB=postgres`).

## Gaps

- **No SSH tunnelling.** Tunnels have to be arranged outside the app. Structured
  TLS controls cover the PostgreSQL/MySQL wires and the fields declared by an
  installed connector; dedicated compiled connectors used without an extension
  still need connector-specific TLS work.
- **No connection folders.** Grouping is inferred from the profile name and
  cannot be set explicitly.
- **No per-profile query timeout or session variables.**
- **Passwords cannot be remembered**, even optionally. There is no keychain path
  for connection secrets, though one exists for the AI provider key.
