use std::collections::BTreeSet;
use std::path::Path;
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{Map, Value};

use crate::db::{
    ColumnMetadata, ConnectionProfile, DatabaseMetadata, DbEngine, DbObjectMetadata,
    DbObjectMetadataKind, ForeignKey, IndexMetadata, RowSet, SchemaMetadata,
};

use super::abi::{connector_request, NativeConnector};
use super::InstalledExtension;

#[derive(Clone)]
pub(crate) struct NativeExtensionConnection {
    connector: Arc<NativeConnector>,
    connection_id: String,
    engine: DbEngine,
    server_version: String,
    secret_values: Arc<Vec<String>>,
}

impl NativeExtensionConnection {
    pub(crate) fn connect(
        extension: &InstalledExtension,
        profile: &ConnectionProfile,
    ) -> Result<Self, String> {
        let library_path = extension
            .library_path
            .as_deref()
            .ok_or_else(|| format!("extension {} is not a native connector", extension.id))?;
        let engine = extension.engine.as_deref().ok_or_else(|| {
            format!(
                "extension {} does not declare a connector engine",
                extension.id
            )
        })?;
        let connector = NativeConnector::load(Path::new(library_path))?;
        if connector.engine() != engine {
            return Err(format!(
                "installed extension engine mismatch: registry={}, abi={}",
                engine,
                connector.engine()
            ));
        }

        let secret_values = connector_secret_values(extension, profile);
        let request = connect_request(profile)?;
        let response = connector
            .call_ok(request)
            .map_err(|error| redact_connector_secrets(&error, &secret_values))?;
        let server_version = response
            .get("serverVersion")
            .and_then(Value::as_str)
            .filter(|version| !version.trim().is_empty())
            .unwrap_or_else(|| connector.engine())
            .to_string();
        let server_version = redact_connector_secrets(&server_version, &secret_values);

        Ok(Self {
            connector: Arc::new(connector),
            connection_id: profile.id.clone(),
            engine: profile.engine,
            server_version,
            secret_values: Arc::new(secret_values),
        })
    }

    pub(crate) fn engine(&self) -> DbEngine {
        self.engine
    }

    pub(crate) fn server_version(&self) -> &str {
        &self.server_version
    }

    pub(crate) fn run_query(&self, sql: &str, cap: usize) -> Result<RowSet, String> {
        let mut request = request_with_connection("query", &self.connection_id);
        request.insert("sql".to_string(), Value::String(sql.to_string()));
        request.insert(
            "maxRows".to_string(),
            Value::Number(serde_json::Number::from(cap as u64)),
        );
        let response = self
            .connector
            .call_ok(Value::Object(request))
            .map_err(|error| redact_connector_secrets(&error, &self.secret_values))?;
        row_set_from_response(response)
    }

    pub(crate) fn metadata(&self) -> Result<DatabaseMetadata, String> {
        let response = self
            .connector
            .call_ok(connector_request("metadata", &self.connection_id))
            .map_err(|error| redact_connector_secrets(&error, &self.secret_values))?;
        metadata_from_response(response)
    }

    pub(crate) fn close(&self) {
        let _ = self
            .connector
            .call(connector_request("close", &self.connection_id));
    }
}

fn connect_request(profile: &ConnectionProfile) -> Result<Value, String> {
    let profile_value = serde_json::to_value(profile)
        .map_err(|error| format!("failed to encode connector profile: {error}"))?;
    let mut request = match profile_value.as_object() {
        Some(profile) => profile.clone(),
        None => Map::new(),
    };
    request.insert("method".to_string(), Value::String("connect".to_string()));
    request.insert(
        "connectionId".to_string(),
        Value::String(profile.id.clone()),
    );
    request.insert("profile".to_string(), profile_value);
    Ok(Value::Object(request))
}

fn collect_secret_field_keys(
    fields: Option<&Value>,
    secret_keys: &mut BTreeSet<String>,
    public_option_keys: &mut BTreeSet<String>,
    redact_options_map: &mut bool,
) {
    let Some(fields) = fields.and_then(Value::as_array) else {
        return;
    };
    for field in fields.iter().take(64) {
        let Some(field) = field.as_object() else {
            continue;
        };
        let profile_field = field.get("profileField").and_then(Value::as_str);
        if profile_field == Some("options") {
            *redact_options_map = true;
            continue;
        }
        let secret = field.get("type").and_then(Value::as_str) == Some("secret")
            || field
                .get("secretPurpose")
                .and_then(Value::as_str)
                .is_some_and(|purpose| !purpose.trim().is_empty());
        let request_key = field
            .get("option")
            .and_then(Value::as_str)
            .or_else(|| {
                profile_field
                    .is_none()
                    .then(|| field.get("id").and_then(Value::as_str))
                    .flatten()
            })
            .map(str::trim)
            .filter(|key| !key.is_empty() && key.len() <= 128);
        if !secret {
            if let Some(key) = request_key {
                public_option_keys.insert(key.to_string());
            }
            continue;
        }
        // Collect both bindings. The frontend rejects unsafe/reserved explicit
        // option keys and safely falls back to the field id; retaining both here
        // keeps redaction correct across old and new frontend versions.
        for key in [field.get("option"), field.get("id")]
            .into_iter()
            .flatten()
            .filter_map(|value| value.as_str())
            .map(str::trim)
            .filter(|key| !key.is_empty() && key.len() <= 128)
        {
            secret_keys.insert(key.to_string());
        }
    }
}

fn connector_secret_values(
    extension: &InstalledExtension,
    profile: &ConnectionProfile,
) -> Vec<String> {
    let mut secret_keys = BTreeSet::new();
    let mut public_option_keys = BTreeSet::new();
    let mut redact_options_map = false;
    if let Some(model) = extension.connection_model.as_ref() {
        collect_secret_field_keys(
            model.pointer("/endpoint/fields"),
            &mut secret_keys,
            &mut public_option_keys,
            &mut redact_options_map,
        );
        collect_secret_field_keys(
            model.get("profileFields"),
            &mut secret_keys,
            &mut public_option_keys,
            &mut redact_options_map,
        );
        collect_secret_field_keys(
            model.pointer("/tls/fields"),
            &mut secret_keys,
            &mut public_option_keys,
            &mut redact_options_map,
        );
        let selected_auth_method = profile.options.get("authMethod").map(String::as_str);
        if let (Some(selected), Some(methods)) = (
            selected_auth_method,
            model.get("authMethods").and_then(Value::as_array),
        ) {
            if let Some(method) = methods
                .iter()
                .take(64)
                .find(|method| method.get("id").and_then(Value::as_str) == Some(selected))
            {
                collect_secret_field_keys(
                    method.get("fields"),
                    &mut secret_keys,
                    &mut public_option_keys,
                    &mut redact_options_map,
                );
            }
        }
    }

    let mut values = Vec::new();
    if let Some(password) = profile.password.as_deref() {
        values.push(password.to_string());
    }
    // Keeping the full DSN in the redaction set also protects errors emitted
    // after connect, where the db-layer URL/password redactor is no longer in
    // the call path.
    if let Some(url) = profile.url.as_deref() {
        values.push(url.to_string());
    }
    for (key, value) in &profile.options {
        let control = matches!(key.as_str(), "authMethod" | "endpointMode" | "tlsMode");
        if secret_keys.contains(key)
            || (redact_options_map && !control && !public_option_keys.contains(key))
        {
            values.push(value.clone());
        }
    }
    values.retain(|value| !value.trim().is_empty());
    values.sort_by(|left, right| right.len().cmp(&left.len()).then_with(|| left.cmp(right)));
    values.dedup();
    values
}

fn redact_connector_secrets(text: &str, values: &[String]) -> String {
    values.iter().fold(text.to_string(), |redacted, secret| {
        redacted.replace(secret, "****")
    })
}

fn request_with_connection(method: &str, connection_id: &str) -> Map<String, Value> {
    let mut request = Map::new();
    request.insert("method".to_string(), Value::String(method.to_string()));
    request.insert(
        "connectionId".to_string(),
        Value::String(connection_id.to_string()),
    );
    request
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionQueryResponse {
    columns: Vec<String>,
    rows: Vec<Vec<Value>>,
    #[serde(default)]
    truncated: bool,
}

fn row_set_from_response(response: Value) -> Result<RowSet, String> {
    let decoded: ExtensionQueryResponse = serde_json::from_value(response)
        .map_err(|error| format!("connector query response is invalid: {error}"))?;
    Ok((decoded.columns, decoded.rows, decoded.truncated))
}

fn metadata_from_response(response: Value) -> Result<DatabaseMetadata, String> {
    let metadata = response
        .get("metadata")
        .cloned()
        .ok_or_else(|| "connector metadata response did not include metadata".to_string())?;
    metadata_from_value(metadata)
}

fn metadata_from_value(metadata: Value) -> Result<DatabaseMetadata, String> {
    let mut decoded: ExtensionDatabaseMetadata = serde_json::from_value(metadata)
        .map_err(|error| format!("connector metadata response is invalid: {error}"))?;
    Ok(decoded.normalize())
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionDatabaseMetadata {
    #[serde(default)]
    schemas: Vec<ExtensionSchemaMetadata>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionSchemaMetadata {
    name: String,
    #[serde(default)]
    objects: Vec<ExtensionObjectMetadata>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionObjectMetadata {
    #[serde(default)]
    schema: Option<String>,
    name: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    comment: Option<String>,
    #[serde(default)]
    ddl: Option<String>,
    #[serde(default)]
    row_estimate: Option<u64>,
    #[serde(default)]
    columns: Vec<ExtensionColumnMetadata>,
    #[serde(default)]
    indexes: Vec<ExtensionIndexMetadata>,
    #[serde(default)]
    primary_key: Vec<String>,
    #[serde(default)]
    foreign_keys: Vec<ExtensionForeignKey>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionColumnMetadata {
    name: String,
    #[serde(default)]
    data_type: Option<String>,
    #[serde(default)]
    nullable: Option<bool>,
    #[serde(default)]
    ordinal: Option<i32>,
    #[serde(default)]
    default_value: Option<String>,
    #[serde(default)]
    comment: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionIndexMetadata {
    name: String,
    #[serde(default)]
    columns: Vec<String>,
    #[serde(default)]
    unique: bool,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionForeignKey {
    #[serde(default)]
    columns: Vec<String>,
    #[serde(default)]
    references_schema: Option<String>,
    #[serde(default)]
    references_table: Option<String>,
    #[serde(default)]
    references_columns: Vec<String>,
}

impl ExtensionDatabaseMetadata {
    fn normalize(&mut self) -> DatabaseMetadata {
        DatabaseMetadata {
            schemas: std::mem::take(&mut self.schemas)
                .into_iter()
                .map(ExtensionSchemaMetadata::normalize)
                .collect(),
        }
    }
}

impl ExtensionSchemaMetadata {
    fn normalize(mut self) -> SchemaMetadata {
        let schema_name = self.name.clone();
        SchemaMetadata {
            name: self.name,
            objects: self
                .objects
                .drain(..)
                .map(|object| object.normalize(&schema_name))
                .collect(),
        }
    }
}

impl ExtensionObjectMetadata {
    fn normalize(self, schema_name: &str) -> DbObjectMetadata {
        DbObjectMetadata {
            schema: self.schema.unwrap_or_else(|| schema_name.to_string()),
            name: self.name,
            kind: normalize_object_kind(self.kind.as_deref()),
            comment: self.comment,
            ddl: self.ddl,
            row_estimate: self.row_estimate,
            sample: None,
            columns: self
                .columns
                .into_iter()
                .enumerate()
                .map(|(index, column)| column.normalize(index))
                .collect(),
            indexes: self
                .indexes
                .into_iter()
                .map(ExtensionIndexMetadata::normalize)
                .collect(),
            primary_key: self.primary_key,
            foreign_keys: self
                .foreign_keys
                .into_iter()
                .filter_map(ExtensionForeignKey::normalize)
                .collect(),
        }
    }
}

impl ExtensionColumnMetadata {
    fn normalize(self, index: usize) -> ColumnMetadata {
        ColumnMetadata {
            name: self.name,
            data_type: self.data_type.unwrap_or_else(|| "unknown".to_string()),
            nullable: self.nullable.unwrap_or(true),
            ordinal: self.ordinal.unwrap_or((index + 1) as i32),
            default_value: self.default_value,
            comment: self.comment,
        }
    }
}

impl ExtensionIndexMetadata {
    fn normalize(self) -> IndexMetadata {
        IndexMetadata {
            name: self.name,
            columns: self.columns,
            unique: self.unique,
        }
    }
}

impl ExtensionForeignKey {
    fn normalize(self) -> Option<ForeignKey> {
        Some(ForeignKey {
            columns: self.columns,
            references_schema: self.references_schema,
            references_table: self.references_table?,
            references_columns: self.references_columns,
        })
    }
}

fn normalize_object_kind(kind: Option<&str>) -> DbObjectMetadataKind {
    match kind.unwrap_or("table").to_ascii_lowercase().as_str() {
        "view" => DbObjectMetadataKind::View,
        "index" => DbObjectMetadataKind::Index,
        "procedure" => DbObjectMetadataKind::Procedure,
        "function" => DbObjectMetadataKind::Function,
        _ => DbObjectMetadataKind::Table,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use super::*;

    #[test]
    fn normalizes_graph_metadata_to_desktop_metadata() {
        let metadata = metadata_from_value(json!({
            "schemas": [{
                "name": "memgraph",
                "objects": [{
                    "name": "Person",
                    "kind": "nodeLabel",
                    "columns": [{"name": "age"}],
                    "indexes": [],
                    "primaryKey": [],
                    "foreignKeys": []
                }]
            }]
        }))
        .unwrap();

        assert_eq!(metadata.schemas[0].name, "memgraph");
        assert_eq!(metadata.schemas[0].objects[0].schema, "memgraph");
        assert_eq!(
            metadata.schemas[0].objects[0].kind,
            DbObjectMetadataKind::Table
        );
        assert_eq!(
            metadata.schemas[0].objects[0].columns[0].data_type,
            "unknown"
        );
        assert_eq!(metadata.schemas[0].objects[0].columns[0].ordinal, 1);
    }

    #[test]
    fn decodes_connector_query_rows() {
        let (columns, rows, truncated) = row_set_from_response(json!({
            "ok": true,
            "columns": ["name"],
            "rows": [["Irodori"]],
            "truncated": true
        }))
        .unwrap();

        assert_eq!(columns, vec!["name"]);
        assert_eq!(rows[0][0], json!("Irodori"));
        assert!(truncated);
    }

    fn installed_extension(connection_model: Value) -> InstalledExtension {
        InstalledExtension {
            id: "irodori.qdrant".to_string(),
            name: "Qdrant".to_string(),
            version: "0.1.0".to_string(),
            runtime: "native".to_string(),
            engine: Some("qdrant".to_string()),
            library_path: Some("connector.so".to_string()),
            host_features: Vec::new(),
            sha256: "abc".to_string(),
            enabled: true,
            installed_at: "0".to_string(),
            abi_version: Some(1),
            supported_calls: vec!["connect".to_string()],
            connection_model: Some(connection_model),
        }
    }

    fn extension_profile(options: BTreeMap<String, String>) -> ConnectionProfile {
        ConnectionProfile {
            id: "vectors".to_string(),
            engine: DbEngine::Qdrant,
            host: Some("vectors.example.test".to_string()),
            port: Some(6333),
            user: None,
            password: Some("legacy-password".to_string()),
            auth: Default::default(),
            tls: Default::default(),
            database: None,
            socket_path: None,
            url: Some("qdrant://token@vectors.example.test".to_string()),
            transport: None,
            read_only: false,
            options,
        }
    }

    #[test]
    fn redacts_model_declared_secrets_from_connector_errors() {
        let extension = installed_extension(json!({
            "endpoint": {
                "fields": [{"id": "region", "type": "string", "option": "region"}]
            },
            "profileFields": [],
            "authMethods": [{
                "id": "apiKey",
                "fields": [{
                    "id": "apiKey",
                    "type": "secret",
                    "secretPurpose": "token"
                }]
            }],
            "tls": {
                "fields": [{
                    "id": "clientPrivateKey",
                    "type": "pem",
                    "secretPurpose": "privateKey"
                }]
            }
        }));
        let profile = extension_profile(BTreeMap::from([
            ("authMethod".to_string(), "apiKey".to_string()),
            ("apiKey".to_string(), "api-key-secret".to_string()),
            (
                "clientPrivateKey".to_string(),
                "private-key-secret".to_string(),
            ),
            ("region".to_string(), "us-east-1".to_string()),
        ]));
        let values = connector_secret_values(&extension, &profile);
        let redacted = redact_connector_secrets(
            "api-key-secret private-key-secret legacy-password qdrant://token@vectors.example.test us-east-1",
            &values,
        );

        assert!(!redacted.contains("api-key-secret"), "{redacted}");
        assert!(!redacted.contains("private-key-secret"), "{redacted}");
        assert!(!redacted.contains("legacy-password"), "{redacted}");
        assert!(!redacted.contains("qdrant://token@"), "{redacted}");
        assert!(redacted.contains("us-east-1"), "{redacted}");
    }

    #[test]
    fn treats_the_selected_custom_options_map_as_transient_secrets() {
        let extension = installed_extension(json!({
            "endpoint": {
                "fields": [{"id": "region", "type": "string", "option": "region"}]
            },
            "profileFields": [{
                "id": "options",
                "type": "map",
                "profileField": "options"
            }],
            "authMethods": [{
                "id": "customDriverOptions",
                "fields": [{
                    "id": "options",
                    "type": "map",
                    "profileField": "options"
                }]
            }]
        }));
        let profile = extension_profile(BTreeMap::from([
            ("authMethod".to_string(), "customDriverOptions".to_string()),
            ("region".to_string(), "us-east-1".to_string()),
            ("cluster".to_string(), "analytics".to_string()),
            ("accessToken".to_string(), "custom-secret".to_string()),
        ]));
        let values = connector_secret_values(&extension, &profile);
        let redacted = redact_connector_secrets(
            "customDriverOptions us-east-1 analytics custom-secret",
            &values,
        );

        assert!(redacted.contains("customDriverOptions"), "{redacted}");
        assert!(redacted.contains("us-east-1"), "{redacted}");
        assert!(!redacted.contains("analytics"), "{redacted}");
        assert!(!redacted.contains("custom-secret"), "{redacted}");
    }
}
