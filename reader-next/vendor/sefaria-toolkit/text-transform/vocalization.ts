import { parseHtml, serializeNodes } from "./html.js";

/** Supported Hebrew vocalization-preservation presets. */
export type VocalizationMode = "taamim_and_nikkud" | "nikkud" | "none";

/** Policy used for U+05C0 PASEQ when cantillation is removed. */
export type PaseqMode = "always" | "after-space";

/** Optional behavior for vocalization transforms. */
export interface VocalizationOptions {
  /** Selects whether every PASEQ or only whitespace-prefixed PASEQ is removed. */
  paseq?: PaseqMode;
}

const PASEQ = "\u05c0";

/**
 * Applies a vocalization preset to plain text without Unicode normalization.
 *
 * @throws {TypeError} When a runtime mode or PASEQ value is unsupported.
 * @see [Vocalization](../README.md#vocalization)
 */
export function applyVocalization(
  text: string,
  mode: VocalizationMode,
  options: VocalizationOptions = {},
): string {
  assertMode(mode);
  const paseq = options.paseq === undefined ? "after-space" : options.paseq;
  assertPaseqMode(paseq);
  return applyValidatedVocalization(text, mode, paseq);
}

function applyValidatedVocalization(
  text: string,
  mode: VocalizationMode,
  paseq: PaseqMode,
): string {
  if (mode === "taamim_and_nikkud" || text.length === 0) {
    return text;
  }

  const result: string[] = [];
  const characters = [...text];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === undefined) {
      continue;
    }

    if (character === PASEQ) {
      if (paseq === "always") {
        continue;
      }

      const previousInput = characters[index - 1];
      if (previousInput !== undefined && /\s/u.test(previousInput)) {
        result.pop();
        continue;
      }

      result.push(character);
      continue;
    }

    if (isCantillation(character)) {
      continue;
    }

    if (mode === "none" && isFullRemovalExtra(character)) {
      continue;
    }

    result.push(character);
  }

  return result.join("");
}

function isCantillation(character: string): boolean {
  // PASEQ is excluded because its removal depends on the selected policy.
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x0591 && codePoint <= 0x05af) ||
      codePoint === 0x05bd ||
      codePoint === 0x05bf ||
      (codePoint >= 0x05c4 && codePoint <= 0x05c5) ||
      codePoint === 0x200d)
  );
}

function isFullRemovalExtra(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x05b0 && codePoint <= 0x05bc) ||
      (codePoint >= 0x05c1 && codePoint <= 0x05c3) ||
      codePoint === 0x05c7)
  );
}

/**
 * Applies vocalization only to text nodes in an already-sanitized HTML fragment.
 *
 * Run {@link normalizeText} first. Markup and attribute values are preserved.
 * This operation is not a sanitizer.
 *
 * @throws {TypeError} When a runtime mode or PASEQ value is unsupported.
 * @see [Vocalization](../README.md#vocalization)
 */
export function applyVocalizationToHtml(
  html: string,
  mode: VocalizationMode,
  options: VocalizationOptions = {},
): string {
  assertMode(mode);
  const paseq = options.paseq === undefined ? "after-space" : options.paseq;
  assertPaseqMode(paseq);

  return serializeNodes(parseHtml(html), (text) =>
    applyValidatedVocalization(text, mode, paseq),
  );
}

function assertMode(mode: string): asserts mode is VocalizationMode {
  if (mode !== "taamim_and_nikkud" && mode !== "nikkud" && mode !== "none") {
    throw new TypeError(`Unsupported vocalization mode: ${mode}`);
  }
}

function assertPaseqMode(mode: string): asserts mode is PaseqMode {
  if (mode !== "always" && mode !== "after-space") {
    throw new TypeError(`Unsupported PASEQ mode: ${mode}`);
  }
}
