import type { ChildNode, Element } from "domhandler";
import { isText } from "domhandler";
import { escapeText } from "entities";

import {
  classTokens,
  hasClass,
  hasOnlyWhitespace,
  isElement,
  parseHtml,
  serializeCloseTag,
  serializeOpenTag,
  textContent,
} from "./html.js";

/** One source-scoped commentary target supplied by a validated host boundary. */
export interface CommentaryReference {
  /** Exact source commentator name. */
  readonly commentator: string;
  /** Exact source order, when present. */
  readonly order?: string | number;
  /** Exact source label, when present. */
  readonly label?: string;
  /** Sefaria reference supplied by matching link evidence. */
  readonly ref: string;
}

/** Feature-narrowing inputs for {@link normalizeText}. */
export interface NormalizeTextOptions {
  /**
   * Retain recognized footnotes. Defaults to `true`.
   *
   * When enabled, footnote markers keep `data-sefaria-note` placeholders whose
   * values are result-local note keys. End-of-text markers also keep
   * `data-sefaria-end-footnote` when {@link allowInlineAnnotations} is enabled.
   */
  readonly allowFootnotes?: boolean;
  /**
   * Retain commentary, overlay, and standalone annotation metadata. Defaults to `true`.
   *
   * When enabled, end-of-text footnote markers keep `data-sefaria-end-footnote`
   * when `allowFootnotes` is also enabled, commentary markers keep
   * `data-sefaria-commentary-marker`, commentary anchors keep
   * `data-sefaria-commentator`, `data-sefaria-label`,
   * and `data-sefaria-order`; matching commentary references can add
   * `data-sefaria-ref`. Overlay anchors keep `data-sefaria-overlay` plus
   * `data-sefaria-value`. When disabled, those attributes and their empty
   * anchor elements are dropped.
   */
  readonly allowInlineAnnotations?: boolean;
  /**
   * Retain named-entity identity as `data-sefaria-slug`. Defaults to `true`.
   *
   * When disabled, named-entity links are unwrapped and only their text remains.
   */
  readonly allowNamedEntities?: boolean;
  /**
   * Retain explicit Sefaria reference identity. Defaults to `true`.
   *
   * When enabled, reference links keep `data-sefaria-ref` and optional
   * `data-sefaria-ven`, `data-sefaria-vhe`, and approved `dir`. When disabled,
   * reference links are unwrapped and those attributes are dropped.
   */
  readonly allowRefLinks?: boolean;
  /**
   * Optional exact commentary targets prepared from source-scoped link evidence.
   *
   * Matching entries add `data-sefaria-ref` to commentary anchors that are also
   * retained by {@link allowInlineAnnotations}. The value is dropped when there
   * is no exact, unique match.
   */
  readonly commentaryReferences?: readonly CommentaryReference[];
}

/** One normalized footnote referenced by a local body placeholder. */
export interface NormalizedFootnote {
  /** Zero-based key local to one normalization result and used as the matching `data-sefaria-note` value. */
  readonly key: number;
  /** Independently safe, balanced marker HTML. */
  readonly markerHtml: string;
  /** Independently safe, balanced body HTML, empty when present-empty, or `null` when missing. */
  readonly contentHtml: string | null;
}

/** Safe, deterministic HTML plus source-ordered footnotes. */
export interface NormalizedText {
  /** Complete safe body HTML with empty `data-sefaria-note` placeholders whose values are note keys. */
  readonly bodyHtml: string;
  /** Source-ordered notes referenced by body or note-content placeholders. */
  readonly notes: readonly NormalizedFootnote[];
}

interface ResolvedNormalizeTextOptions {
  readonly allowFootnotes: boolean;
  readonly allowInlineAnnotations: boolean;
  readonly allowNamedEntities: boolean;
  readonly allowRefLinks: boolean;
  readonly commentaryReferences: CommentaryReferenceIndex;
}

const ORDINARY_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "small",
  "sup",
  "sub",
]);
const ACTIVE_TAGS = new Set([
  "script",
  "style",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "noscript",
]);
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "center",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "marquee",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "search",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);
const MAM_VALUES = new Map([
  ["mam-spi-pe", "petuchah"],
  ["mam-spi-samekh", "setumah"],
  ["mam-spi-invnun", "inverted-nun"],
  ["mam-kq", "ketiv-qere"],
  ["mam-kq-k", "ketiv"],
  ["mam-kq-q", "qere"],
  ["mam-kq-trivial", "trivial-variant"],
]);

/**
 * Converts untrusted Sefaria text markup into safe, directly renderable HTML.
 *
 * The operation parses once, removes unsupported attributes, emits no URLs,
 * and extracts footnotes into result-local records. Options can narrow but
 * never widen the fixed output grammar.
 *
 * @remarks
 * Output keeps only these ordinary inline tags without attributes: `b`,
 * `strong`, `i`, `em`, `u`, `small`, `sup`, and `sub`. It keeps `br`, maps
 * `big` to `<span style="font-size: larger;">`, converts `img` to its `alt`
 * text, unwraps block elements with separators, and removes active content.
 * Incoming style attributes are dropped. The fixed `font-size: larger;` style
 * emitted for `big` is the only output style. The only ordinary attribute is
 * `dir`, and only on `i` or generated `span` elements when the value is `ltr`,
 * `rtl`, or `auto`.
 *
 * Recognized structural attributes are `data-sefaria-note`,
 * `data-sefaria-end-footnote`, `data-sefaria-commentary-marker`,
 * `data-sefaria-commentator`, `data-sefaria-label`, `data-sefaria-order`,
 * `data-sefaria-overlay`, `data-sefaria-value`, `data-sefaria-ref`,
 * `data-sefaria-ven`, `data-sefaria-vhe`, `data-sefaria-slug`, and
 * `data-sefaria-mam`. Footnote placeholders use `data-sefaria-note` values that
 * match note keys in {@link NormalizedText.notes}.
 *
 * @example
 * ```ts
 * normalizeText('See <a data-ref="Micah 6:8" href="/Micah.6.8">Micah</a><script>x()</script>').bodyHtml;
 * // 'See <span data-sefaria-ref="Micah 6:8">Micah</span>'
 * ```
 *
 * @throws {TypeError} When commentary reference input is invalid.
 * @throws {RangeError} When projected output exceeds `max(65_536, html.length * 8)` UTF-16 code units.
 * @see [Text normalization](../IMPLEMENTATION.md#text-normalization)
 */
export function normalizeText(
  html: string,
  options: NormalizeTextOptions = {},
): NormalizedText {
  const resolvedOptions: ResolvedNormalizeTextOptions = {
    allowFootnotes: options.allowFootnotes ?? true,
    allowInlineAnnotations: options.allowInlineAnnotations ?? true,
    allowNamedEntities: options.allowNamedEntities ?? true,
    allowRefLinks: options.allowRefLinks ?? true,
    commentaryReferences: new CommentaryReferenceIndex(
      options.commentaryReferences ?? [],
    ),
  };
  const budget = new ProjectionBudget(Math.max(65_536, html.length * 8));
  const body = new HtmlWriter(budget);
  const notes: MutableNormalizedFootnote[] = [];
  const tasks: NormalizeTask[] = [
    {
      kind: "nodes",
      nodes: parseHtml(html),
      index: 0,
      writer: body,
      direction: undefined,
    },
  ];

  while (tasks.length > 0) {
    const task = tasks.pop();
    if (!task) {
      break;
    }

    if (task.kind === "close") {
      task.writer.appendMarkup(serializeCloseTag(task.name));
      continue;
    }
    if (task.kind === "separator") {
      task.writer.requestSeparator();
      continue;
    }
    if (task.kind === "finalize") {
      task.writer.closeInheritedDirection();
      task.note[task.field] = task.writer.toString();
      continue;
    }

    if (task.index >= task.nodes.length) {
      continue;
    }
    const node = task.nodes[task.index];
    if (!node) {
      continue;
    }

    const bodyIndex = findFollowingFootnoteBody(task.nodes, task.index);
    const marker = isFootnoteMarker(node);
    const pairedBodyIndex =
      marker && bodyIndex !== null ? bodyIndex : undefined;
    tasks.push({
      ...task,
      index:
        pairedBodyIndex === undefined ? task.index + 1 : pairedBodyIndex + 1,
    });

    if (isText(node)) {
      task.writer.appendText(node.data);
      continue;
    }
    if (!isElement(node)) {
      continue;
    }

    if (marker) {
      if (!resolvedOptions.allowFootnotes) {
        continue;
      }
      const key = notes.length;
      const note: MutableNormalizedFootnote = {
        key,
        markerHtml: "",
        contentHtml: pairedBodyIndex === undefined ? null : "",
      };
      notes.push(note);
      task.writer.appendMarkup(
        serializeOpenTag("span", { "data-sefaria-note": String(key) }) +
          serializeCloseTag("span"),
      );

      const markerWriter = new HtmlWriter(budget, task.direction);
      if (pairedBodyIndex !== undefined) {
        const bodyNode = task.nodes[pairedBodyIndex];
        if (bodyNode && isElement(bodyNode, "i")) {
          const contentWriter = new HtmlWriter(budget, task.direction);
          tasks.push({
            kind: "finalize",
            writer: contentWriter,
            note,
            field: "contentHtml",
          });
          tasks.push({
            kind: "nodes",
            nodes: bodyNode.children,
            index: 0,
            writer: contentWriter,
            direction: task.direction,
          });
        }
      }
      tasks.push({
        kind: "finalize",
        writer: markerWriter,
        note,
        field: "markerHtml",
      });
      tasks.push({
        kind: "nodes",
        nodes: node.children,
        index: 0,
        writer: markerWriter,
        direction: task.direction,
      });
      continue;
    }

    const action = classifyElement(node, resolvedOptions);
    if (action.kind === "remove") {
      continue;
    }
    if (action.kind === "text") {
      task.writer.appendText(action.text);
      continue;
    }
    if (action.kind === "unwrap") {
      tasks.push({
        kind: "nodes",
        nodes: node.children,
        index: 0,
        writer: task.writer,
        direction: task.direction,
      });
      continue;
    }
    if (action.kind === "block") {
      task.writer.requestSeparator();
      tasks.push({ kind: "separator", writer: task.writer });
      tasks.push({
        kind: "nodes",
        nodes: node.children,
        index: 0,
        writer: task.writer,
        direction: task.direction,
      });
      continue;
    }

    task.writer.appendMarkup(serializeOpenTag(action.name, action.attributes));
    if (action.name !== "br") {
      tasks.push({
        kind: "close",
        name: action.name,
        writer: task.writer,
      });
      if (!action.suppressChildren) {
        tasks.push({
          kind: "nodes",
          nodes: node.children,
          index: 0,
          writer: task.writer,
          direction: action.direction ?? task.direction,
        });
      }
    }
  }

  return {
    bodyHtml: body.toString(),
    notes: notes.map(({ key, markerHtml, contentHtml }) => ({
      key,
      markerHtml,
      contentHtml,
    })),
  };
}

function classifyElement(
  element: Element,
  options: ResolvedNormalizeTextOptions,
): ElementAction {
  const name = element.name;
  if (ACTIVE_TAGS.has(name)) {
    return { kind: "remove" };
  }
  if (name === "img") {
    return { kind: "text", text: element.attribs.alt ?? "" };
  }
  if (BLOCK_TAGS.has(name)) {
    return { kind: "block" };
  }
  if (name === "br") {
    return { kind: "element", name, attributes: {} };
  }
  if (name === "big") {
    return {
      kind: "element",
      name: "span",
      attributes: { style: "font-size: larger;" },
    };
  }
  if (name === "span") {
    return classifySpan(element);
  }
  if (name === "a") {
    return classifyAnchor(element, options);
  }
  if (name === "i") {
    return classifyItalic(element, options);
  }
  if (name === "sup") {
    return classifySuperscript(element, options);
  }
  if (ORDINARY_TAGS.has(name)) {
    return { kind: "element", name, attributes: {} };
  }
  return { kind: "unwrap" };
}

function classifySpan(element: Element): ElementAction {
  const direction = approvedDirection(element.attribs.dir);
  // SEFARIA-READER EXTENSION: keep poetry indentation and muted emphasis. Upstream unwraps these spans,
  // which flattens Psalms and Isaiah (every poetic line's indent is carried only by these classes).
  const poetry = classTokens(element).includes("indentAllDouble")
    ? "indent-double"
    : classTokens(element).includes("indentAll")
      ? "indent"
      : undefined;
  if (poetry && classTokens(element).includes("poetry")) {
    const attributes: Record<string, string> = { "data-sefaria-poetry": poetry };
    addDirection(attributes, direction);
    return { kind: "element", name: "span", attributes, direction };
  }
  if (classTokens(element).includes("mediumGrey")) {
    const attributes: Record<string, string> = { "data-sefaria-tone": "muted" };
    addDirection(attributes, direction);
    return { kind: "element", name: "span", attributes, direction };
  }
  const mamClasses = classTokens(element).filter((token) =>
    MAM_VALUES.has(token),
  );
  if (mamClasses.length === 1) {
    const mam = mamClasses[0] ? MAM_VALUES.get(mamClasses[0]) : undefined;
    if (mam) {
      const attributes: Record<string, string> = {
        "data-sefaria-mam": mam,
      };
      addDirection(attributes, direction);
      return {
        kind: "element",
        name: "span",
        attributes,
        direction,
      };
    }
  }
  if (direction) {
    return {
      kind: "element",
      name: "span",
      attributes: { dir: direction },
      direction,
    };
  }
  return { kind: "unwrap" };
}

function classifyItalic(
  element: Element,
  options: ResolvedNormalizeTextOptions,
): ElementAction {
  if (hasClass(element, "footnote")) {
    return {
      kind: "element",
      name: "i",
      attributes: {},
    };
  }

  if (isEmptyElement(element)) {
    const commentator = element.attribs["data-commentator"];
    const overlay = element.attribs["data-overlay"];
    const value = element.attribs["data-value"];
    const hasCommentary = commentator !== undefined && overlay === undefined;
    const hasOverlay =
      overlay !== undefined && value !== undefined && commentator === undefined;
    if (hasCommentary || hasOverlay) {
      if (!options.allowInlineAnnotations) {
        return { kind: "remove" };
      }
      const attributes: Record<string, string> = {};
      addDirection(attributes, approvedDirection(element.attribs.dir));
      if (hasCommentary && commentator !== undefined) {
        attributes["data-sefaria-commentator"] = commentator;
        addIfDefined(
          attributes,
          "data-sefaria-label",
          element.attribs["data-label"],
        );
        addIfDefined(
          attributes,
          "data-sefaria-order",
          element.attribs["data-order"],
        );
        const ref = options.commentaryReferences.resolve({
          commentator,
          order: element.attribs["data-order"],
          label: element.attribs["data-label"],
        });
        addIfDefined(attributes, "data-sefaria-ref", ref);
      } else if (overlay !== undefined && value !== undefined) {
        attributes["data-sefaria-overlay"] = overlay;
        attributes["data-sefaria-value"] = value;
      }
      return {
        kind: "element",
        name: "span",
        attributes,
        suppressChildren: true,
      };
    }
  }

  const direction = approvedDirection(element.attribs.dir);
  return {
    kind: "element",
    name: "i",
    attributes: direction ? { dir: direction } : {},
    direction,
  };
}

function classifySuperscript(
  element: Element,
  options: ResolvedNormalizeTextOptions,
): ElementAction {
  if (hasClass(element, "endFootnote")) {
    return options.allowInlineAnnotations && options.allowFootnotes
      ? {
          kind: "element",
          name: "span",
          attributes: {
            "data-sefaria-end-footnote": textContent(element.children),
          },
          suppressChildren: true,
        }
      : { kind: "remove" };
  }
  if (hasClass(element, "itag")) {
    return options.allowInlineAnnotations
      ? {
          kind: "element",
          name: "span",
          attributes: {
            "data-sefaria-commentary-marker": textContent(element.children),
          },
          suppressChildren: true,
        }
      : { kind: "remove" };
  }
  return { kind: "element", name: "sup", attributes: {} };
}

function classifyAnchor(
  element: Element,
  options: ResolvedNormalizeTextOptions,
): ElementAction {
  const dataRef = element.attribs["data-ref"];
  if (dataRef !== undefined && dataRef.trim().length > 0) {
    if (!options.allowRefLinks) {
      return { kind: "unwrap" };
    }
    const attributes: Record<string, string> = {
      "data-sefaria-ref": dataRef,
    };
    addIfDefined(attributes, "data-sefaria-ven", element.attribs["data-ven"]);
    addIfDefined(attributes, "data-sefaria-vhe", element.attribs["data-vhe"]);
    const direction = approvedDirection(element.attribs.dir);
    addDirection(attributes, direction);
    return {
      kind: "element",
      name: "span",
      attributes,
      direction,
    };
  }

  if (hasClass(element, "namedEntityLink")) {
    const slug = element.attribs["data-slug"];
    if (
      !options.allowNamedEntities ||
      slug === undefined ||
      slug.trim().length === 0
    ) {
      return { kind: "unwrap" };
    }
    const attributes: Record<string, string> = {
      "data-sefaria-slug": slug,
    };
    const direction = approvedDirection(element.attribs.dir);
    addDirection(attributes, direction);
    return {
      kind: "element",
      name: "span",
      attributes,
      direction,
    };
  }

  return { kind: "unwrap" };
}

function findFollowingFootnoteBody(
  nodes: readonly ChildNode[],
  markerIndex: number,
): number | null {
  let index = markerIndex + 1;
  while (index < nodes.length) {
    const node = nodes[index];
    if (!node) {
      return null;
    }
    if (hasOnlyWhitespace(node)) {
      index += 1;
      continue;
    }
    return isElement(node, "i") && hasClass(node, "footnote") ? index : null;
  }
  return null;
}

function isFootnoteMarker(node: ChildNode): boolean {
  return isElement(node, "sup") && hasClass(node, "footnote-marker");
}

function isEmptyElement(element: Element): boolean {
  return element.children.every((child) => hasOnlyWhitespace(child));
}

function approvedDirection(
  value: string | undefined,
): "ltr" | "rtl" | "auto" | undefined {
  return value === "ltr" || value === "rtl" || value === "auto"
    ? value
    : undefined;
}

function addDirection(
  attributes: Record<string, string>,
  direction: "ltr" | "rtl" | "auto" | undefined,
): void {
  if (direction) {
    attributes.dir = direction;
  }
}

function addIfDefined(
  attributes: Record<string, string>,
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    attributes[name] = value;
  }
}

class CommentaryReferenceIndex {
  readonly #references = new Map<string, Set<string>>();

  constructor(references: readonly CommentaryReference[]) {
    for (const [index, reference] of references.entries()) {
      if (
        !reference ||
        typeof reference.commentator !== "string" ||
        reference.commentator.trim().length === 0
      ) {
        throw new TypeError(
          `Commentary reference ${index} requires a nonblank commentator.`,
        );
      }
      if (
        typeof reference.ref !== "string" ||
        reference.ref.trim().length === 0
      ) {
        throw new TypeError(
          `Commentary reference ${index} requires a nonblank ref.`,
        );
      }
      const order = normalizeOrder(reference.order, index);
      if (
        reference.label !== undefined &&
        typeof reference.label !== "string"
      ) {
        throw new TypeError(
          `Commentary reference ${index} label must be a string.`,
        );
      }
      const key = commentaryKey(reference.commentator, order, reference.label);
      const targets = this.#references.get(key) ?? new Set<string>();
      targets.add(reference.ref);
      this.#references.set(key, targets);
    }
  }

  resolve(input: {
    readonly commentator: string;
    readonly order?: string | undefined;
    readonly label?: string | undefined;
  }): string | undefined {
    const targets = this.#references.get(
      commentaryKey(input.commentator, input.order, input.label),
    );
    return targets?.size === 1 ? targets.values().next().value : undefined;
  }
}

function normalizeOrder(
  order: string | number | undefined,
  index: number,
): string | undefined {
  if (order === undefined || typeof order === "string") {
    return order;
  }
  if (Number.isSafeInteger(order)) {
    return String(order);
  }
  throw new TypeError(
    `Commentary reference ${index} order must be a string or safe integer.`,
  );
}

function commentaryKey(
  commentator: string,
  order: string | undefined,
  label: string | undefined,
): string {
  return JSON.stringify([commentator, order ?? null, label ?? null]);
}

class HtmlWriter {
  readonly #budget: ProjectionBudget;
  readonly #chunks: string[] = [];
  #hasVisibleContent = false;
  #pendingSeparator = false;
  #inheritedDirection: "ltr" | "rtl" | "auto" | undefined;

  constructor(
    budget: ProjectionBudget,
    inheritedDirection?: "ltr" | "rtl" | "auto",
  ) {
    this.#budget = budget;
    this.#inheritedDirection = inheritedDirection;
    if (inheritedDirection) {
      this.appendMarkup(serializeOpenTag("span", { dir: inheritedDirection }));
    }
  }

  appendText(text: string): void {
    if (text.length === 0) {
      return;
    }
    this.#flushSeparator(text);
    this.#append(escapeText(text));
    this.#hasVisibleContent = true;
  }

  appendMarkup(markup: string): void {
    if (markup.length === 0) {
      return;
    }
    this.#flushSeparator(markup);
    this.#append(markup);
  }

  requestSeparator(): void {
    if (this.#hasVisibleContent) {
      this.#pendingSeparator = true;
    }
  }

  closeInheritedDirection(): void {
    if (this.#inheritedDirection) {
      this.#append(serializeCloseTag("span"));
      this.#inheritedDirection = undefined;
    }
  }

  toString(): string {
    return this.#chunks.join("");
  }

  #append(value: string): void {
    this.#budget.add(value.length);
    this.#chunks.push(value);
  }

  #flushSeparator(next: string): void {
    if (!this.#pendingSeparator) {
      return;
    }
    if (!/^\s/u.test(next)) {
      this.#append(" ");
    }
    this.#pendingSeparator = false;
  }
}

class ProjectionBudget {
  readonly #maximumLength: number;
  #length = 0;

  constructor(maximumLength: number) {
    this.#maximumLength = maximumLength;
  }

  add(length: number): void {
    this.#length += length;
    if (this.#length > this.#maximumLength) {
      throw new RangeError(
        "Text normalization exceeded the projected output limit",
      );
    }
  }
}

interface MutableNormalizedFootnote {
  readonly key: number;
  markerHtml: string;
  contentHtml: string | null;
}

interface NodesTask {
  readonly kind: "nodes";
  readonly nodes: readonly ChildNode[];
  readonly index: number;
  readonly writer: HtmlWriter;
  readonly direction?: "ltr" | "rtl" | "auto" | undefined;
}

interface CloseTask {
  readonly kind: "close";
  readonly name: string;
  readonly writer: HtmlWriter;
}

interface SeparatorTask {
  readonly kind: "separator";
  readonly writer: HtmlWriter;
}

interface FinalizeTask {
  readonly kind: "finalize";
  readonly writer: HtmlWriter;
  readonly note: MutableNormalizedFootnote;
  readonly field: "markerHtml" | "contentHtml";
}

type NormalizeTask = NodesTask | CloseTask | SeparatorTask | FinalizeTask;

type ElementAction =
  | { readonly kind: "remove" }
  | { readonly kind: "unwrap" }
  | { readonly kind: "block" }
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "element";
      readonly name: string;
      readonly attributes: Readonly<Record<string, string>>;
      readonly suppressChildren?: boolean;
      readonly direction?: "ltr" | "rtl" | "auto" | undefined;
    };
