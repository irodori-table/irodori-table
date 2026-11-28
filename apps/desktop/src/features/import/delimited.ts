import { LocalizedError, keyMessage } from "@/core";

const READ_BYTES = 64 * 1024;
const MAX_ROW_CHARS = 4 * 1024 * 1024;

/** A quote, escaped quote, CRLF or UTF-8 code point can straddle file reads. */
export class DelimitedReader {
  private cells: string[] = [];
  private cell = "";
  private quoted = false;
  private afterQuote = false;
  private afterCr = false;
  private rowChars = 0;

  constructor(private readonly delimiter: string) {}

  *read(chunk: string): Generator<string[]> {
    for (const char of chunk) {
      if (this.afterCr) {
        this.afterCr = false;
        if (char === "\n") continue;
      }
      if (++this.rowChars > MAX_ROW_CHARS) {
        throw new LocalizedError(keyMessage("import.error.rowTooLarge"));
      }
      if (this.afterQuote) {
        this.afterQuote = false;
        if (char === '"') {
          this.cell += '"';
          continue;
        }
        this.quoted = false;
      }
      if (this.quoted) {
        if (char === '"') this.afterQuote = true;
        else this.cell += char;
      } else if (char === '"') {
        this.quoted = true;
      } else if (char === this.delimiter) {
        this.cells.push(this.cell);
        this.cell = "";
      } else if (char === "\r" || char === "\n") {
        this.afterCr = char === "\r";
        yield this.takeRow();
      } else {
        this.cell += char;
      }
    }
  }

  *finish(): Generator<string[]> {
    if (this.quoted && !this.afterQuote) {
      throw new LocalizedError(keyMessage("import.error.unclosedQuote"));
    }
    if (this.rowChars) yield this.takeRow();
  }

  private takeRow(): string[] {
    this.cells.push(this.cell);
    const row = this.cells;
    this.cells = [];
    this.cell = "";
    this.rowChars = 0;
    return row;
  }
}

export async function* delimitedFileRows(
  file: Blob,
  delimiter: string,
  signal?: AbortSignal,
): AsyncGenerator<string[]> {
  const decoder = new TextDecoder();
  const reader = new DelimitedReader(delimiter);
  for (let offset = 0; offset < file.size; offset += READ_BYTES) {
    signal?.throwIfAborted();
    const bytes = await file.slice(offset, offset + READ_BYTES).arrayBuffer();
    yield* reader.read(decoder.decode(bytes, { stream: true }));
  }
  signal?.throwIfAborted();
  yield* reader.read(decoder.decode());
  yield* reader.finish();
}
