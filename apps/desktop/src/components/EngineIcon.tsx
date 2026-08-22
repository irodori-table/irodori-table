import {
  SiApachecassandra,
  SiApachehive,
  SiArangodb,
  SiClickhouse,
  SiCockroachlabs,
  SiCouchbase,
  SiDatabricks,
  SiDuckdb,
  SiElasticsearch,
  SiGooglebigquery,
  SiGooglebigtable,
  SiGooglecloudspanner,
  SiH2database,
  SiInfluxdb,
  SiMariadb,
  SiMilvus,
  SiMongodb,
  SiMysql,
  SiNeo4j,
  SiOpensearch,
  SiPostgresql,
  SiRedis,
  SiScylladb,
  SiSnowflake,
  SiSqlite,
  SiSupabase,
  SiTidb,
  SiTimescale,
  SiTrino,
  type IconType,
} from "@icons-pack/react-simple-icons";
import {
  Activity,
  Bird,
  Boxes,
  Container,
  Cpu,
  Database,
  Droplets,
  Globe,
  KeySquare,
  MountainSnow,
  Server,
  Telescope,
  TreePine,
  Triangle,
  Warehouse,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Per-engine brand marks keyed by `DbEngine` id.
 *
 * Artwork is from simple-icons (CC0 / public domain), rendered as a monochrome
 * silhouette in the current text color so it blends into the UI. Trademark-strict
 * brands fall through to a neutral category glyph rather than a look-alike.
 */
const BRAND: Record<string, IconType> = {
  postgres: SiPostgresql,
  mysql: SiMysql,
  mariadb: SiMariadb,
  sqlite: SiSqlite,
  mongodb: SiMongodb,
  redis: SiRedis,
  snowflake: SiSnowflake,
  clickhouse: SiClickhouse,
  cassandra: SiApachecassandra,
  scylladb: SiScylladb,
  neo4j: SiNeo4j,
  elasticsearch: SiElasticsearch,
  openSearch: SiOpensearch,
  duckdb: SiDuckdb,
  motherduck: SiDuckdb,
  cockroachdb: SiCockroachlabs,
  influxdb: SiInfluxdb,
  couchbase: SiCouchbase,
  arangodb: SiArangodb,
  bigquery: SiGooglebigquery,
  databricks: SiDatabricks,
  trinoPresto: SiTrino,
  milvus: SiMilvus,
  hive: SiApachehive,
  tidb: SiTidb,
  timescaledb: SiTimescale,
  cloudSpanner: SiGooglecloudspanner,
  bigtable: SiGooglebigtable,
  supabase: SiSupabase,
  h2: SiH2database,
};

/**
 * Glyphs for engines whose logo is not in the CC0 brand set. Every engine gets
 * its own mark: a shared glyph reads as "no icon assigned" in the connections
 * rail, where the icon is the only thing telling two profiles apart.
 */
const FALLBACK: Record<string, LucideIcon> = {
  oracle: Database,
  sqlserver: Server,
  yugabytedb: Globe,
  neon: Zap,
  firebird: Bird,
  redshift: Warehouse,
  athena: Telescope,
  memgraph: Workflow,
  qdrant: Boxes,
  pinecone: TreePine,
  dynamodb: KeySquare,
  questdb: Activity,
  iotdb: Cpu,
  iceberg: MountainSnow,
  s3Tables: Container,
  deltaLake: Triangle,
  hudi: Droplets,
};

/**
 * Whether `engine` has a mark of its own rather than the generic default.
 * `engine-icon.test.tsx` holds every shipped engine to this.
 */
export function hasEngineIcon(engine: string): boolean {
  return engine in BRAND || engine in FALLBACK;
}

type EngineIconProps = {
  engine: string;
  size?: number;
  className?: string;
};

export function EngineIcon({ engine, size = 16, className }: EngineIconProps) {
  const Brand = BRAND[engine];
  if (Brand) {
    return (
      <Brand
        size={size}
        color="currentColor"
        className={className}
        aria-hidden="true"
      />
    );
  }
  const Fallback = FALLBACK[engine] ?? Database;
  return <Fallback size={size} className={className} aria-hidden="true" />;
}
