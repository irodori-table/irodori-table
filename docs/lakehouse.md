# Lakehouse connections

The lakehouse line moved to its own repository:
**[irodori-table/irodori-lakehouse](https://github.com/irodori-table/irodori-lakehouse)**.

A standard Irodori Table build ships none of it:

- The **Lakehouse** sidebar panel and the `irodori.datalake` feature extension
  that used to activate it are gone from this repository.
- The bundled marketplace catalog no longer lists `irodori.iceberg`,
  `irodori.delta-lake`, `irodori.hudi`, `irodori.hive`, `irodori.athena`, or
  `irodori.s3-tables`. They are served from the lakehouse repository's registry
  instead.

The engines themselves are still recognised. Iceberg, Delta Lake, Hudi, Hive,
Athena, and S3 Tables remain in the connection form's engine list, and the app
still knows which extension backs each one, so **Connect** fails with the same
message as before when the extension is absent:

> This data source needs the `irodori.iceberg` connector extension. Install it
> from Extensions, then try again. Build availability: …

The difference is where the extension comes from. Follow the setup guide in the
lakehouse repository — [`docs/lakehouse.md`](https://github.com/irodori-table/irodori-lakehouse/blob/main/docs/lakehouse.md) —
for the catalog, install, and connection steps.

DuckDB (`irodori.duckdb`), MotherDuck (`irodori.motherduck`), Databricks
(`irodori.databricks`), and Trino/Presto (`irodori.trino-presto`) stayed in this
repository's catalog: they are general-purpose analytical engines rather than
lakehouse-only ones, so [Extensions](extensions.md) still covers installing them.
