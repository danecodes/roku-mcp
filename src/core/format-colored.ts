/**
 * Chalk-colored tree formatter for CLI output.
 * The plain-text formatter lives in roku-ecp as formatTree.
 */

import chalk from 'chalk';
import type { UiNode, FormatOptions } from '@danecodes/roku-ecp';

interface ColoredFormatOptions extends FormatOptions {
  highlight?: string;
}

const KEY_ATTRS = new Set([
  'focused',
  'text',
  'name',
  'visible',
  'opacity',
]);

export function formatTreeColored(
  node: UiNode,
  options: ColoredFormatOptions = {},
  depth = 0,
): string {
  const lines: string[] = [];
  printNode(node, options, depth, lines);
  return lines.join('\n');
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

function printNode(
  node: UiNode,
  options: ColoredFormatOptions,
  depth: number,
  lines: string[],
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
