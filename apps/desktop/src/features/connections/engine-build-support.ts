import type { DbEngine, EngineBuildSupport } from "@/generated/irodori-api";
import type { TranslationKey, Translator } from "@/i18n";
import { engineLabel } from "./connection-profiles";

const connectorStatusDocUrl =
  "https://irodori-table.github.io/irodori-docs/data-source-support-status.html";

export function buildSupportByEngine(items: EngineBuildSupport[]) {
  return new Map(items.map((item) => [item.engine, item]));
}

/** True when the engine needs a Cargo feature this build was compiled without. */
export function isFeatureMissing(support: EngineBuildSupport | undefined) {
  return Boolean(
    support?.requiredFeature && support.includedInCurrentBuild === false,
  );
}

export function featureMissingMessage(
  engine: DbEngine,
  support: EngineBuildSupport | undefined,
  t: Translator["t"],
) {
  if (!isFeatureMissing(support)) {
    return null;
  }
  return [
    t("connection.build.notAvailable", { engine: engineLabel(engine) }),
    t("connection.build.useStandardRelease"),
    t("connection.build.availability", { url: connectorStatusDocUrl }),
  ].join(" ");
}

function isMysqlSocketEngine(engine: DbEngine) {
  return engine === "mysql" || engine === "mariadb" || engine === "tidb";
}

export function socketPathLabelKey(engine: DbEngine): TranslationKey {
  return isMysqlSocketEngine(engine)
    ? "connection.socketFile"
    : "connection.socketDirectory";
}

export function socketPathPlaceholder(engine: DbEngine) {
  return isMysqlSocketEngine(engine)
    ? "/var/run/mysqld/mysqld.sock"
    : "/var/run/postgresql";
}
