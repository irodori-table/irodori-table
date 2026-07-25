import {
  translate,
  type InterpolationValues,
  type TranslationKey,
  type Translator,
} from "@/i18n";
import { errorMessage } from "./errors";

/**
 * A message a non-component module wants to show a user, carried as either a
 * translation key or already-final text.
 *
 * Stores, parsers and export helpers cannot call `t()` sensibly: they have no
 * hook context, and a string they resolve once is frozen in whatever locale
 * was active at the time — switch the language while an error is on screen and
 * it stays in the old one. Returning the key instead keeps the module
 * rendering-agnostic and lets the component re-resolve on every render.
 *
 * `text` is the escape hatch for content that is not translatable: a message
 * from the backend, a filename, a driver's own error.
 */
export type LocalizedMessage =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "key";
      readonly key: TranslationKey;
      readonly values?: InterpolationValues;
    };

/** Wrap already-final text (backend messages, filenames) as a message. */
export function textMessage(text: string): LocalizedMessage {
  return { kind: "text", text };
}

/** Reference a translation key, resolved later by whoever renders it. */
export function keyMessage(
  key: TranslationKey,
  values?: InterpolationValues,
): LocalizedMessage {
  return { kind: "key", key, values };
}

/** Resolve a message for display. Pass a component's `t`. */
export function resolveMessage(
  t: Translator["t"],
  message: LocalizedMessage,
): string {
  return message.kind === "key" ? t(message.key, message.values) : message.text;
}

/** Render a message in English, for logs and untranslated fallbacks. */
function englishText(message: LocalizedMessage): string {
  return message.kind === "key"
    ? translate(message.key, { values: message.values })
    : message.text;
}

/**
 * An error that knows how to say itself in the user's language.
 *
 * `Error.message` is set to the English rendering, so the many `catch` blocks
 * that still call plain `errorMessage(error)` keep producing readable text
 * instead of "[object Object]" — localisation can then be adopted one call site
 * at a time by switching them to `localizedErrorMessage(t, error)`.
 */
export class LocalizedError extends Error {
  readonly localized: LocalizedMessage;

  constructor(localized: LocalizedMessage) {
    super(englishText(localized));
    this.name = "LocalizedError";
    this.localized = localized;
  }
}

/** Throw helper: `throw localizedError("erd.export.error.tooLargeForPng")`. */
export function localizedError(
  key: TranslationKey,
  values?: InterpolationValues,
): LocalizedError {
  return new LocalizedError(keyMessage(key, values));
}

/**
 * `errorMessage`, but localised: a `LocalizedError` resolves through `t`, and
 * anything else falls back to the plain message extraction.
 */
export function localizedErrorMessage(
  t: Translator["t"],
  error: unknown,
): string {
  if (error instanceof LocalizedError) {
    return resolveMessage(t, error.localized);
  }
  return errorMessage(error);
}
