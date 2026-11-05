use irodori_error::{IrodoriError, IrodoriErrorKind};

pub type DbResult<T> = std::result::Result<T, DbError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DbError {
    kind: IrodoriErrorKind,
    message: String,
    code: Option<String>,
    retryable: bool,
}

impl DbError {
    pub(crate) fn new(kind: IrodoriErrorKind, message: impl Into<String>) -> Self {
        let retryable = matches!(
            kind,
            IrodoriErrorKind::Connection | IrodoriErrorKind::Timeout | IrodoriErrorKind::Transport
        );
        Self {
            kind,
            message: message.into(),
            code: None,
            retryable,
        }
    }

    pub(crate) fn validation(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Validation, message)
    }

    pub(crate) fn unsupported(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Unsupported, message)
    }

    pub(crate) fn not_found(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::NotFound, message)
    }

    pub(crate) fn connection(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Connection, message)
    }

    pub(crate) fn query(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Query, message)
    }

    pub(crate) fn metadata(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Metadata, message)
    }

    pub(crate) fn edit(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Edit, message)
    }

    pub(crate) fn timeout(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Timeout, message)
    }

    pub(crate) fn cancelled(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Cancelled, message)
    }

    pub(crate) fn transport(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Transport, message)
    }

    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self::new(IrodoriErrorKind::Internal, message)
    }

    pub(crate) fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    pub(crate) fn message(&self) -> &str {
        &self.message
    }

    #[cfg(test)]
    pub(crate) fn contains(&self, needle: &str) -> bool {
        self.message.contains(needle)
    }
}

/// The text to show for a driver error.
///
/// sqlx writes a Postgres error as `<message> at line <n>`, where `n` is the
/// line of PostgreSQL's own C source that raised it. That means nothing to
/// someone using the app, and in a SQL editor it reads as a line of their query.
/// Other databases keep sqlx's text: it carries their error codes, and a MySQL
/// "at line 1" really is a line of the query.
pub(crate) fn describe_sqlx_error(error: &sqlx::Error) -> String {
    if let sqlx::Error::Database(database) = error {
        if let Some(postgres) = database.try_downcast_ref::<sqlx::postgres::PgDatabaseError>() {
            return postgres.message().to_string();
        }
    }
    error.to_string()
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for DbError {}

impl From<DbError> for IrodoriError {
    fn from(value: DbError) -> Self {
        let mut error = IrodoriError::new(value.kind, value.message).retryable(value.retryable);
        if let Some(code) = value.code {
            error = error.with_code(code);
        }
        error
    }
}

impl From<IrodoriError> for DbError {
    fn from(value: IrodoriError) -> Self {
        Self {
            kind: value.kind,
            message: value.message,
            code: value.code,
            retryable: value.retryable,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::describe_sqlx_error;
    use sqlx::error::{DatabaseError, ErrorKind};
    use std::error::Error;

    #[derive(Debug)]
    struct MysqlLikeError;

    impl std::fmt::Display for MysqlLikeError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str("1064 (42000): syntax error at line 1")
        }
    }

    impl Error for MysqlLikeError {}

    impl DatabaseError for MysqlLikeError {
        fn message(&self) -> &str {
            "syntax error at line 1"
        }

        fn as_error(&self) -> &(dyn Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn Error + Send + Sync + 'static> {
            self
        }

        fn kind(&self) -> ErrorKind {
            ErrorKind::Other
        }
    }

    #[test]
    fn other_databases_keep_their_error_codes_and_query_lines() {
        // The Postgres branch is exercised against a real server in
        // tests/integration_db.rs: sqlx does not let a test build its error type.
        let error = sqlx::Error::Database(Box::new(MysqlLikeError));
        assert_eq!(
            describe_sqlx_error(&error),
            "error returned from database: 1064 (42000): syntax error at line 1"
        );
    }

    #[test]
    fn errors_from_outside_the_database_keep_their_text() {
        assert_eq!(
            describe_sqlx_error(&sqlx::Error::PoolTimedOut),
            sqlx::Error::PoolTimedOut.to_string()
        );
    }
}
