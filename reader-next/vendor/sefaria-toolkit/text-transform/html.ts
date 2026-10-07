import type { ChildNode, Element } from "domhandler";
import { hasChildren, isTag, isText } from "domhandler";
import { escapeAttribute, escapeText } from "entities";
import { parseDocument } from "htmlparser2";

const VOID_TAGS = new Set(["br"]);

/**
 * Parses an HTML fragment using browser-style recovery and decoded entities.
 *
 * @see [Parsing and serialization](../IMPLEMENTATION.md#parsing-and-serialization)
 */
export function parseHtml(html: string): ChildNode[] {
  return parseDocument(html, {
    decodeEntities: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  }).children;
}

/** Returns normalized non-empty class tokens from a parsed element. */
export function classTokens(element: Element): string[] {
  return (element.attribs.class ?? "").split(/\s+/u).filter(Boolean);
}

/** Tests whether a parsed element contains one exact class token. */
export function hasClass(element: Element, token: string): boolean {
  return classTokens(element).includes(token);
}

/** Tests whether a parsed node is a text node containing only whitespace. */
export function hasOnlyWhitespace(node: ChildNode): boolean {
  return isText(node) && node.data.trim().length === 0;
}

/** Narrows a parsed node to an element and optionally checks its tag name. */
export function isElement(node: ChildNode, name?: string): node is Element {
  return isTag(node) && (name === undefined || node.name === name);
}

/** Serializes one opening tag with escaped, deterministically ordered attributes. */
export function serializeOpenTag(
  name: string,
  attributes: Readonly<Record<string, string>> = {},
): string {
  const serializedAttributes = Object.entries(attributes)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([attribute, value]) => ` ${attribute}="${escapeAttribute(value)}"`)
    .join("");
  return `<${name}${serializedAttributes}>`;
}

/** Serializes a closing tag, omitting closers for supported void elements. */
export function serializeCloseTag(name: string): string {
  return VOID_TAGS.has(name) ? "" : `</${name}>`;
}

function identityText(text: string): string {
  return text;
}

/** Serializes parsed nodes iteratively, optionally transforming text-node values. */
export function serializeNodes(
  nodes: readonly ChildNode[],
  transformText: (text: string) => string = identityText,
): string {
  const output: string[] = [];
  // An explicit task stack keeps serialization safe for deeply nested input.
  const tasks: SerializeTask[] = [{ kind: "nodes", nodes, index: 0 }];

  while (tasks.length > 0) {
    const task = tasks.pop();
    if (!task) {
      break;
    }

    if (task.kind === "close") {
      output.push(serializeCloseTag(task.name));
      continue;
    }

    if (task.index >= task.nodes.length) {
      continue;
    }

    const node = task.nodes[task.index];
    tasks.push({ ...task, index: task.index + 1 });
    if (!node) {
      continue;
    }

    if (isText(node)) {
      output.push(escapeText(transformText(node.data)));
      continue;
    }

    if (!isElement(node)) {
      if (hasChildren(node)) {
        tasks.push({ kind: "nodes", nodes: node.children, index: 0 });
      }
      continue;
    }

    output.push(serializeOpenTag(node.name, node.attribs));
    if (!VOID_TAGS.has(node.name)) {
      tasks.push({ kind: "close", name: node.name });
      tasks.push({ kind: "nodes", nodes: node.children, index: 0 });
    }
  }

  return output.join("");
}

/** Returns decoded descendant text without retaining markup. */
export function textContent(nodes: readonly ChildNode[]): string {
  const output: string[] = [];
  const stack = [...nodes].reverse();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (isText(node)) {
      output.push(node.data);
    } else if (hasChildren(node)) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index];
        if (child) {
          stack.push(child);
        }
      }
    }
  }

  return output.join("");
}

interface SerializeNodesTask {
  readonly kind: "nodes";
  readonly nodes: readonly ChildNode[];
  readonly index: number;
}

interface SerializeCloseTask {
  readonly kind: "close";
  readonly name: string;
}

type SerializeTask = SerializeNodesTask | SerializeCloseTask;
