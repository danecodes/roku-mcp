/**
 * Roku UI tree parser and query engine.
 *
 * Parses the XML from ECP's /query/app-ui endpoint into a structured
 * tree, and provides selector-based element queries.
 */

import { parseStringPromise } from 'xml2js';
import chalk from 'chalk';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface UiNode {
  tag: string;
  name?: string;
  attrs: Record<string, string>;
  children: UiNode[];
  parent?: UiNode;
}

export interface FindOptions {
  /** Timeout in ms for waitForElement. Default 5000. */
  timeout?: number;
  /** Poll interval in ms. Default 200. */
  interval?: number;
}

/* ------------------------------------------------------------------ */
/*  XML → UiNode parsing                                              */
/* ------------------------------------------------------------------ */

interface RawXmlNode {
  '#name': string;
  $?: Record<string, string>;
  $$?: RawXmlNode[];
}

const WRAPPER_NODES = new Set([
  'app-ui',
  'status',
  'error',
  'topscreen',
  'plugin',
  'screen',
]);

export async function parseUiXml(xml: string): Promise<UiNode> {
  const raw = await parseStringPromise(xml, {
    explicitChildren: true,
    preserveChildrenOrder: true,
    charsAsChildren: false,
    explicitRoot: false,
  });
  return unwrap(convertNode(raw as RawXmlNode));
}

function convertNode(raw: RawXmlNode, parent?: UiNode): UiNode {
  const node: UiNode = {
    tag: raw['#name'],
    attrs: raw.$ ?? {},
    children: [],
    parent,
  };
  node.name = node.attrs.name ?? node.attrs.id;

  if (raw.$$) {
    for (const child of raw.$$) {
      node.children.push(convertNode(child, node));
    }
  }
  return node;
}

/** Skip wrapper nodes (app-ui, topscreen, screen, etc.) to get to real content. */
function unwrap(node: UiNode): UiNode {
  if (WRAPPER_NODES.has(node.tag) && node.children.length > 0) {
    for (const child of node.children) {
      if (!WRAPPER_NODES.has(child.tag)) {
        return child;
      }
      const unwrapped = unwrap(child);
      if (unwrapped !== child) return unwrapped;
    }
    // All children are wrappers — descend into the last one
    return unwrap(node.children[node.children.length - 1]);
  }
  return node;
}

/* ------------------------------------------------------------------ */
/*  Selector matching                                                 */
/* ------------------------------------------------------------------ */

/**
 * Find elements matching a CSS-like selector.
 *
 * Supported selector syntax:
 *   - Tag name:        `HomePage`
 *   - Tag#id:          `AppButton#actionBtn`  (matches name or id attribute)
 *   - #id:             `#titleLabel`
 *   - Descendant:      `HomePage HomeHeroCarousel`
 *   - Child:           `LayoutGroup > AppLabel`
 *   - nth-child:       `AppButton:nth-child(1)`
 *   - Adjacent sibling: `CollectionModule + CollectionModule`
 */
export function findElements(root: UiNode, selector: string): UiNode[] {
  const parts = tokenizeSelector(selector);
  return matchParts(root, parts, 0, false);
}

export function findElement(
  root: UiNode,
  selector: string
): UiNode | undefined {
  const results = findElements(root, selector);
  return results[0];
}

/* ---- Tokenizer ---- */

interface SelectorToken {
  type: 'node' | 'child' | 'adjacent';
  tag?: string;
  id?: string;
  nthChild?: number;
}

function tokenizeSelector(selector: string): SelectorToken[] {
  const tokens: SelectorToken[] = [];
  const raw = selector.trim().split(/\s+/);

  for (let i = 0; i < raw.length; i++) {
    const part = raw[i];

    if (part === '>') {
      tokens.push({ type: 'child' });
      continue;
    }
    if (part === '+') {
      tokens.push({ type: 'adjacent' });
      continue;
    }

    // Parse tag#id:nth-child(n) or just #id or just tag
    const match = part.match(
      /^(\*|[A-Za-z][A-Za-z0-9_]*)?(?:#([A-Za-z0-9_:\\-]+))?(?::nth-child\((\d+)\))?$/
    );
    if (!match) {
      tokens.push({ type: 'node', tag: part });
      continue;
    }

    const [, tag, id, nth] = match;
    tokens.push({
      type: 'node',
      tag: tag === '*' ? undefined : tag,
      id: id?.replace(/\\\\/g, '\\'),
      nthChild: nth ? parseInt(nth, 10) : undefined,
    });
  }

  return tokens;
}

/* ---- Matching engine ---- */

function matchParts(
  node: UiNode,
  parts: SelectorToken[],
  partIndex: number,
  directChildOnly: boolean
): UiNode[] {
  if (partIndex >= parts.length) return [];

  const token = parts[partIndex];

  // Combinator tokens — modify the next match
  if (token.type === 'child') {
    return matchParts(node, parts, partIndex + 1, true);
  }
  if (token.type === 'adjacent') {
    return matchAdjacentSibling(node, parts, partIndex + 1);
  }

  const isLastPart = partIndex === parts.length - 1;
  const results: UiNode[] = [];

  // Try matching this node
  if (matchesToken(node, token)) {
    if (isLastPart) {
      results.push(node);
    } else {
      // Continue matching children with the next part
      for (const child of node.children) {
        results.push(...matchParts(child, parts, partIndex + 1, false));
      }
    }
  }

  // If not direct-child-only, also try descendants
  if (!directChildOnly) {
    for (const child of node.children) {
      results.push(...matchParts(child, parts, partIndex, false));
    }
  }

  // Deduplicate (a node could match via multiple paths)
  return [...new Set(results)];
}

function matchAdjacentSibling(
  contextNode: UiNode,
  parts: SelectorToken[],
  nextPartIndex: number
): UiNode[] {
  if (nextPartIndex >= parts.length) return [];
  const results: UiNode[] = [];

  // Find all nodes, then check their next sibling
  const allNodes = collectAll(contextNode);
  for (const node of allNodes) {
    if (!node.parent) continue;
    const siblings = node.parent.children;
    const idx = siblings.indexOf(node);
    if (idx < 0 || idx >= siblings.length - 1) continue;
    const nextSibling = siblings[idx + 1];
    const token = parts[nextPartIndex];
    if (token.type === 'node' && matchesToken(nextSibling, token)) {
      if (nextPartIndex === parts.length - 1) {
        results.push(nextSibling);
      }
    }
  }
  return [...new Set(results)];
}

function matchesToken(node: UiNode, token: SelectorToken): boolean {
  if (token.tag && node.tag !== token.tag) return false;
  if (token.id) {
    const nodeId = node.attrs.name ?? node.attrs.id;
    if (nodeId !== token.id) return false;
  }
  if (token.nthChild !== undefined) {
    if (!node.parent) return false;
    const siblings = node.parent.children.filter(
      (c) => !token.tag || c.tag === token.tag
    );
    const idx = siblings.indexOf(node);
    if (idx !== token.nthChild - 1) return false;
  }
  return true;
}

function collectAll(node: UiNode): UiNode[] {
  const result: UiNode[] = [node];
  for (const child of node.children) {
    result.push(...collectAll(child));
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Tree formatting                                                   */
/* ------------------------------------------------------------------ */

export interface FormatOptions {
  maxDepth?: number;
  attrs?: string[];
  highlight?: string;
  allAttrs?: boolean;
}

const KEY_ATTRS = new Set([
  'focused',
  'text',
  'name',
  'visible',
  'opacity',
]);

export function formatTree(
  node: UiNode,
  options: FormatOptions = {},
  depth = 0
): string {
  const lines: string[] = [];
  printNode(node, options, depth, lines);
  return lines.join('\n');
}

function printNode(
  node: UiNode,
  options: FormatOptions,
  depth: number,
  lines: string[]
): void {
  if (options.maxDepth !== undefined && depth > options.maxDepth) return;

  const indent = '  '.repeat(depth);
  const attrFilter = options.attrs
    ? new Set(options.attrs)
    : options.allAttrs
      ? null
      : KEY_ATTRS;

  const attrParts: string[] = [];
  for (const [key, value] of Object.entries(node.attrs)) {
    if (attrFilter && !attrFilter.has(key)) continue;

    if (key === 'focused' && value === 'true') {
      attrParts.push(chalk.yellow(`${key}="${value}"`));
    } else if (key === 'text') {
      const truncated =
        value.length > 60 ? value.slice(0, 57) + '...' : value;
      attrParts.push(chalk.green(`${key}="${truncated}"`));
    } else if (key === 'name') {
      attrParts.push(chalk.cyan(`${key}="${value}"`));
    } else if (
      (key === 'visible' && value === 'false') ||
      (key === 'opacity' && value === '0')
    ) {
      attrParts.push(chalk.dim(`${key}="${value}"`));
    } else {
      attrParts.push(chalk.dim(`${key}="${value}"`));
    }
  }

  const isHighlighted =
    options.highlight && matchesSimpleSelector(node, options.highlight);
  const tagStr = isHighlighted ? chalk.bgYellow.black(node.tag) : chalk.white(node.tag);
  const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';
  const childCount = node.children.length;
  const countStr =
    childCount > 0 ? chalk.dim(` (${childCount} children)`) : '';

  lines.push(`${indent}${tagStr}${attrStr}${countStr}`);

  for (const child of node.children) {
    printNode(child, options, depth + 1, lines);
  }
}

function matchesSimpleSelector(node: UiNode, selector: string): boolean {
  const parts = selector.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const hashIndex = last.indexOf('#');
  if (hashIndex >= 0) {
    const tag = last.slice(0, hashIndex);
    const id = last.slice(hashIndex + 1);
    if (tag && node.tag !== tag) return false;
    const nodeId = node.attrs.name ?? node.attrs.id;
    return nodeId === id;
  }
  return node.tag === last;
}

/* ------------------------------------------------------------------ */
/*  Plain text format (no color — for agents / MCP responses)         */
/* ------------------------------------------------------------------ */

export function formatTreePlain(
  node: UiNode,
  options: FormatOptions = {},
  depth = 0
): string {
  const lines: string[] = [];
  printNodePlain(node, options, depth, lines);
  return lines.join('\n');
}

function printNodePlain(
  node: UiNode,
  options: FormatOptions,
  depth: number,
  lines: string[]
): void {
  if (options.maxDepth !== undefined && depth > options.maxDepth) return;

  const indent = '  '.repeat(depth);
  const attrFilter = options.attrs
    ? new Set(options.attrs)
    : options.allAttrs
      ? null
      : KEY_ATTRS;

  const attrParts: string[] = [];
  for (const [key, value] of Object.entries(node.attrs)) {
    if (attrFilter && !attrFilter.has(key)) continue;
    const truncated =
      key === 'text' && value.length > 80
        ? value.slice(0, 77) + '...'
        : value;
    attrParts.push(`${key}="${truncated}"`);
  }

  const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';
  const childCount = node.children.length;
  const countStr = childCount > 0 ? ` (${childCount} children)` : '';

  lines.push(`${indent}${node.tag}${attrStr}${countStr}`);

  for (const child of node.children) {
    printNodePlain(child, options, depth + 1, lines);
  }
}
