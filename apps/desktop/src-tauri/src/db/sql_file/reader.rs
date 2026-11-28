//! Bounded UTF-8 SQLite script reader. A partial statement is rescanned only
//! after the window doubles; short statements share the same input buffer.

use std::io;
use tokio::io::{AsyncRead, AsyncReadExt};

use super::super::MAX_SQL_BYTES;

pub(super) const READ_BYTES: usize = 32 * 1024;

pub(super) struct Statement {
    pub sql: String,
    pub start: u64,
    pub end: u64,
    pub line: u64,
}

pub(super) struct ScriptReader<R> {
    input: R,
    bytes: Vec<u8>,
    index: usize,
    base: u64,
    line: u64,
    eof: bool,
}

impl<R: AsyncRead + Unpin> ScriptReader<R> {
    pub fn new(input: R) -> Self {
        Self {
            input,
            bytes: Vec::new(),
            index: 0,
            base: 0,
            line: 1,
            eof: false,
        }
    }

    pub fn position(&self) -> u64 {
        self.base + self.index as u64
    }

    pub async fn next(&mut self) -> io::Result<Option<Statement>> {
        loop {
            let slice = &self.bytes[self.index..];
            let (start, boundary) = statement_bounds(slice);
            if let Some(end) = boundary.or(self.eof.then_some(slice.len())) {
                if end > MAX_SQL_BYTES {
                    return Err(self.too_large());
                }
                let statement = if let Some(start) = start {
                    let sql = std::str::from_utf8(&slice[start..end]).map_err(|e| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!(
                                "invalid UTF-8 at byte {}",
                                self.base
                                    + self.index as u64
                                    + start as u64
                                    + e.valid_up_to() as u64
                            ),
                        )
                    })?;
                    Some(Statement {
                        sql: sql.to_owned(),
                        start: self.base + (self.index + start) as u64,
                        end: self.base + (self.index + end) as u64,
                        line: self.line + newlines(&slice[..start]),
                    })
                } else {
                    None
                };
                self.line += newlines(&slice[..end]);
                self.index += end;
                if statement.is_some() || self.eof && self.index == self.bytes.len() {
                    return Ok(statement);
                }
                continue;
            }
            if slice.len() > MAX_SQL_BYTES {
                return Err(self.too_large());
            }
            // Grow geometrically for a large statement, capped at one byte
            // beyond the limit so EOF at exactly MAX_SQL_BYTES still works.
            let extra = slice
                .len()
                .max(READ_BYTES)
                .min(MAX_SQL_BYTES + 1 - slice.len());
            self.bytes.drain(..self.index);
            self.base += self.index as u64;
            self.index = 0;
            let count = (&mut self.input)
                .take(extra as u64)
                .read_to_end(&mut self.bytes)
                .await?;
            self.eof = count < extra;
        }
    }

    fn too_large(&self) -> io::Error {
        io::Error::new(io::ErrorKind::InvalidData, format!(
            "Cannot run the statement near line {}, byte {}. To stay within the {MAX_SQL_BYTES}-byte limit, split the statement into smaller statements",
            self.line, self.base + self.index as u64
        ))
    }
}

fn newlines(bytes: &[u8]) -> u64 {
    bytes.iter().filter(|&&byte| byte == b'\n').count() as u64
}

#[derive(PartialEq)]
enum Boundary {
    Start,
    Explain,
    Query,
    Create,
    Ordinary,
    Trigger,
    TriggerSeparator,
    TriggerEnd,
}

// In SQLite a trigger ends with a statement separator followed by END and a
// final separator. CASE ... END inside a trigger's SELECT is a normal token.
fn statement_bounds(bytes: &[u8]) -> (Option<usize>, Option<usize>) {
    use Boundary::*;
    let mut start = None;
    let mut state = Start;
    let mut i = 0;
    while i < bytes.len() {
        let from = i;
        let c = bytes[i];
        i += 1;
        match c {
            c if c.is_ascii_whitespace() => continue,
            0xef if bytes[from..].starts_with(&[0xef, 0xbb, 0xbf]) => {
                i += 2;
                continue;
            }
            b'-' if bytes.get(i) == Some(&b'-') => {
                i += bytes[i..]
                    .iter()
                    .position(|&c| c == b'\n')
                    .unwrap_or(bytes.len() - i);
                continue;
            }
            b'/' if bytes.get(i) == Some(&b'*') => {
                i += 1;
                i = bytes[i..]
                    .windows(2)
                    .position(|s| s == b"*/")
                    .map_or(bytes.len(), |n| i + n + 2);
                continue;
            }
            b';' => {
                match state {
                    Trigger | TriggerSeparator => state = TriggerSeparator,
                    _ => return (start, Some(i)),
                }
                continue;
            }
            b'\'' | b'"' | b'`' | b'[' => {
                let close = if c == b'[' { b']' } else { c };
                while i < bytes.len() {
                    if bytes[i] == close {
                        i += 1;
                        if c != b'[' && bytes.get(i) == Some(&close) {
                            i += 1;
                        } else {
                            break;
                        }
                    } else {
                        i += 1;
                    }
                }
            }
            c if word_byte(c) => {
                while i < bytes.len() && word_byte(bytes[i]) {
                    i += 1;
                }
            }
            _ => {}
        }
        start.get_or_insert(from);
        let token = &bytes[from..i];
        state = match state {
            Start if token.eq_ignore_ascii_case(b"explain") => Explain,
            Explain if token.eq_ignore_ascii_case(b"query") => Query,
            Query if token.eq_ignore_ascii_case(b"plan") => Start,
            Start | Explain if token.eq_ignore_ascii_case(b"create") => Create,
            Create
                if token.eq_ignore_ascii_case(b"temp")
                    || token.eq_ignore_ascii_case(b"temporary") =>
            {
                Create
            }
            Create if token.eq_ignore_ascii_case(b"trigger") => Trigger,
            TriggerSeparator if token.eq_ignore_ascii_case(b"end") => TriggerEnd,
            Trigger | TriggerEnd | TriggerSeparator => Trigger,
            _ => Ordinary,
        };
    }
    (start, None)
}

fn word_byte(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'$' || c >= 128
}
