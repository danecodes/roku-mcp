#!/usr/bin/env node

/**
 * MCP Server for Roku device interaction.
 *
 * Exposes Roku ECP operations as MCP tools that AI agents can call
 * to inspect, control, and debug Roku applications.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EcpClient, Key } from '../core/ecp-client.js';
import {
  parseUiXml,
  findElement,
  findElements,
  formatTreePlain,
} from '../core/ui-tree.js';

/* ------------------------------------------------------------------ */
/*  Server setup                                                      */
/* ------------------------------------------------------------------ */

const server = new McpServer({
  name: 'roku-mcp',
  version: '0.1.0',
});

const deviceIp = process.env.ROKU_DEVICE_IP ?? '192.168.0.30';
const devPassword = process.env.ROKU_DEV_PASSWORD ?? 'rokudev';
const client = new EcpClient(deviceIp, 8060, { devPassword });

/* ------------------------------------------------------------------ */
/*  Tools                                                             */
/* ------------------------------------------------------------------ */

server.tool(
  'roku_ui_tree',
  'Get the current SceneGraph UI tree from the Roku device. Returns a structured text representation of all visible nodes with their attributes (name, text, focused, visible, opacity). Use this to understand what is currently displayed on screen.',
  {
    depth: z.number().optional().describe('Max depth to display (default: unlimited)'),
    all_attrs: z.boolean().optional().describe('Show all attributes, not just key ones'),
  },
  async ({ depth, all_attrs }) => {
    const xml = await client.queryAppUi();
    const tree = await parseUiXml(xml);
    const text = formatTreePlain(tree, {
      maxDepth: depth,
      allAttrs: all_attrs,
    });
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'roku_find_element',
  `Find elements in the UI tree matching a CSS-like selector. Supported syntax:
  - Tag name: "HomePage"
  - Tag#name: "AppButton#actionBtn"
  - #name: "#titleLabel"
  - Descendant: "HomePage HomeHeroCarousel"
  - Child: "LayoutGroup > AppLabel"
  - Adjacent sibling: "CollectionModule + CollectionModule"
  - nth-child: "AppButton:nth-child(1)"`,
  {
    selector: z.string().describe('CSS-like selector to match against SceneGraph nodes'),
    all_attrs: z.boolean().optional().describe('Show all attributes on matched elements'),
  },
  async ({ selector, all_attrs }) => {
    const xml = await client.queryAppUi();
    const tree = await parseUiXml(xml);
    const results = findElements(tree, selector);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: `No elements found matching: ${selector}` }],
      };
    }

    const lines = [`Found ${results.length} element(s) matching "${selector}":\n`];
    for (const node of results) {
      lines.push(formatTreePlain(node, { maxDepth: 1, allAttrs: all_attrs }));
      lines.push('');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'roku_press_key',
  `Send a remote control key press to the Roku device. Available keys: ${Object.keys(Key).join(', ')}`,
  {
    key: z.string().describe('Key to press (e.g. Select, Up, Down, Left, Right, Back, Home)'),
    times: z.number().optional().describe('Number of times to press (default: 1)'),
    delay: z.number().optional().describe('Delay between presses in ms (default: 100)'),
  },
  async ({ key, times, delay }) => {
    await client.press(key, { times, delay });
    const msg = `Pressed ${key}${times && times > 1 ? ` x${times}` : ''}`;
    return { content: [{ type: 'text', text: msg }] };
  }
);

server.tool(
  'roku_type_text',
  'Type text into a keyboard input on the Roku device. Each character is sent as a separate key press.',
  {
    text: z.string().describe('Text to type'),
    delay: z.number().optional().describe('Delay between characters in ms (default: 50)'),
  },
  async ({ text, delay }) => {
    await client.type(text, { delay });
    return { content: [{ type: 'text', text: `Typed: ${text}` }] };
  }
);

server.tool(
  'roku_launch',
  'Launch a channel/app on the Roku device. Use "dev" for the sideloaded development channel.',
  {
    channel_id: z.string().optional().describe('Channel ID to launch (default: "dev")'),
    params: z
      .record(z.string(), z.string())
      .optional()
      .describe('Launch parameters (e.g. contentId, mediaType for deep linking)'),
  },
  async ({ channel_id, params }) => {
    const id = channel_id ?? 'dev';
    await client.launch(id, params as Record<string, string> | undefined);
    return { content: [{ type: 'text', text: `Launched channel ${id}` }] };
  }
);

server.tool(
  'roku_device_info',
  'Get information about the connected Roku device (model, software version, network, etc.).',
  { _: z.string().optional().describe('unused') },
  async () => {
    const info = await client.queryDeviceInfo();
    return {
      content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
    };
  }
);

server.tool(
  'roku_active_app',
  'Get the currently active/running app on the Roku device.',
  { _: z.string().optional().describe('unused') },
  async () => {
    const app = await client.queryActiveApp();
    return {
      content: [{ type: 'text', text: JSON.stringify(app, null, 2) }],
    };
  }
);

server.tool(
  'roku_media_player',
  'Get the current media player state (playback position, duration, format, buffering status).',
  { _: z.string().optional().describe('unused') },
  async () => {
    const state = await client.queryMediaPlayer();
    return {
      content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
    };
  }
);

server.tool(
  'roku_installed_apps',
  'List all installed apps/channels on the Roku device.',
  { _: z.string().optional().describe('unused') },
  async () => {
    const apps = await client.queryInstalledApps();
    const lines = apps.map(
      (a) => `${a.id.padEnd(8)} ${a.name} (v${a.version})`
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'roku_input',
  'Send custom input/deep link parameters to the running app via ECP input command.',
  {
    params: z
      .record(z.string(), z.string())
      .describe('Key-value parameters to send to the app'),
  },
  async ({ params }) => {
    await client.input(params as Record<string, string>);
    return {
      content: [
        {
          type: 'text',
          text: `Sent input: ${JSON.stringify(params)}`,
        },
      ],
    };
  }
);

server.tool(
  'roku_screenshot',
  'Take a screenshot of the Roku device screen. Returns a PNG image and optionally saves to disk. Requires developer mode with a sideloaded app.',
  {
    save_path: z.string().optional().describe('File path to save the PNG to (e.g. "./screenshot.png"). If omitted, only returns the image inline.'),
  },
  async ({ save_path }) => {
    const buf = await client.takeScreenshot();

    if (save_path) {
      const fs = await import('fs');
      const path = await import('path');
      const resolved = path.resolve(save_path);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, buf);
    }

    const content: Array<{ type: 'image'; data: string; mimeType: string } | { type: 'text'; text: string }> = [
      {
        type: 'image' as const,
        data: buf.toString('base64'),
        mimeType: 'image/png',
      },
    ];

    if (save_path) {
      content.push({
        type: 'text' as const,
        text: `Screenshot saved to ${save_path}`,
      });
    }

    return { content };
  }
);

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`MCP server error: ${err.message}`);
  process.exit(1);
});
