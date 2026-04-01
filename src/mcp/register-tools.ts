import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EcpClient, Key } from '../core/ecp-client.js';
import {
  parseUiXml,
  findElements,
  formatTreePlain,
} from '../core/ui-tree.js';
import {
  waitFor,
  assertElement,
  sideloadAndWatch,
  smokeTest,
  focusedElement,
  screenName,
  consoleWatch,
  certPreflight,
  chanperfSample,
} from '../core/tool-handlers.js';

export function registerTools(server: McpServer, client: EcpClient): void {
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
      const text = formatTreePlain(tree, { maxDepth: depth, allAttrs: all_attrs });
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
        return { content: [{ type: 'text', text: `No elements found matching: ${selector}` }] };
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
      params: z.record(z.string(), z.string()).optional().describe('Launch parameters (e.g. contentId, mediaType for deep linking)'),
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
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    }
  );

  server.tool(
    'roku_active_app',
    'Get the currently active/running app on the Roku device.',
    { _: z.string().optional().describe('unused') },
    async () => {
      const app = await client.queryActiveApp();
      return { content: [{ type: 'text', text: JSON.stringify(app, null, 2) }] };
    }
  );

  server.tool(
    'roku_media_player',
    'Get the current media player state (playback position, duration, format, buffering status).',
    { _: z.string().optional().describe('unused') },
    async () => {
      const state = await client.queryMediaPlayer();
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    }
  );

  server.tool(
    'roku_installed_apps',
    'List all installed apps/channels on the Roku device.',
    { _: z.string().optional().describe('unused') },
    async () => {
      const apps = await client.queryInstalledApps();
      const lines = apps.map((a) => `${a.id.padEnd(8)} ${a.name} (v${a.version})`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.tool(
    'roku_input',
    'Send custom input/deep link parameters to the running app via ECP input command.',
    {
      params: z.record(z.string(), z.string()).describe('Key-value parameters to send to the app'),
    },
    async ({ params }) => {
      await client.input(params as Record<string, string>);
      return { content: [{ type: 'text', text: `Sent input: ${JSON.stringify(params)}` }] };
    }
  );

  server.tool(
    'roku_close_app',
    'Close the currently running app by pressing the Home key.',
    { _: z.string().optional().describe('unused') },
    async () => {
      await client.closeApp();
      return { content: [{ type: 'text', text: 'App closed (Home pressed)' }] };
    }
  );

  server.tool(
    'roku_deep_link',
    'Deep link into a specific piece of content in a channel. Launches the channel with contentId and optional mediaType parameters.',
    {
      channel_id: z.string().optional().describe('Channel ID (default: "dev")'),
      content_id: z.string().describe('Content ID to deep link to'),
      media_type: z.string().optional().describe('Media type (e.g. "episode", "movie", "series", "shortFormVideo")'),
    },
    async ({ channel_id, content_id, media_type }) => {
      const id = channel_id ?? 'dev';
      await client.deepLink(id, content_id, media_type);
      return { content: [{ type: 'text', text: `Deep linked to ${content_id} in channel ${id}` }] };
    }
  );

  server.tool(
    'roku_volume',
    'Control the Roku device volume.',
    {
      action: z.enum(['up', 'down', 'mute']).describe('Volume action'),
      times: z.number().optional().describe('Number of times to repeat (for up/down, default: 1)'),
    },
    async ({ action, times }) => {
      const count = times ?? 1;
      for (let i = 0; i < count; i++) {
        if (action === 'up') await client.volumeUp();
        else if (action === 'down') await client.volumeDown();
        else await client.volumeMute();
      }
      return { content: [{ type: 'text', text: `Volume ${action}${count > 1 ? ` x${count}` : ''}` }] };
    }
  );

  server.tool(
    'roku_sideload',
    'Sideload a .zip package to the Roku device. Replaces the current dev channel. If no path is provided, look for the most recently modified .zip file in common build output directories like target/, build/, out/, or dist/.',
    {
      zip_path: z.string().describe('Path to the .zip package to sideload. If unsure, search for .zip files in target/, build/, out/, or dist/ directories and use the most recent one.'),
    },
    async ({ zip_path }) => {
      const result = await client.sideload(zip_path);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'roku_console_log',
    'Read output from the BrightScript debug console (port 8085). Returns recent log output including print statements, runtime errors, and crash backtraces.',
    {
      duration: z.number().optional().describe('How long to read in ms (default: 2000).'),
      filter: z.string().optional().describe('Only return lines containing this text (case-insensitive).'),
    },
    async ({ duration, filter }) => {
      const output = await client.readConsole({ duration, filter });
      if (!output.trim()) return { content: [{ type: 'text', text: '(no console output)' }] };
      return { content: [{ type: 'text', text: output }] };
    }
  );

  server.tool(
    'roku_console_command',
    'Send a command to the BrightScript debug console. Common commands: "bt" (backtrace), "var" (show variables), "cont" (continue), "step", "over", "out".',
    {
      command: z.string().describe('Debug command to send (e.g. "bt", "var", "cont")'),
      duration: z.number().optional().describe('How long to read the response in ms (default: 2000)'),
    },
    async ({ command, duration }) => {
      const output = await client.sendConsoleCommand(command, { duration });
      if (!output.trim()) return { content: [{ type: 'text', text: '(no response)' }] };
      return { content: [{ type: 'text', text: output }] };
    }
  );

  server.tool(
    'roku_screenshot',
    'Take a screenshot of the Roku device screen. Returns a PNG image and optionally saves to disk.',
    {
      save_path: z.string().optional().describe('File path to save the PNG to. If omitted, only returns the image inline.'),
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
        { type: 'image' as const, data: buf.toString('base64'), mimeType: 'image/png' },
      ];
      if (save_path) content.push({ type: 'text' as const, text: `Screenshot saved to ${save_path}` });
      return { content };
    }
  );

  // Priority 1 — Test runner
  server.tool(
    'roku_wait_for',
    'Poll until a SceneGraph element matching a selector appears on screen, or a timeout is reached.',
    {
      selector: z.string().describe('CSS-like selector to wait for'),
      timeout: z.number().optional().describe('Max time to wait in ms (default: 10000)'),
      interval: z.number().optional().describe('Poll interval in ms (default: 500)'),
    },
    async ({ selector, timeout, interval }) => {
      const result = await waitFor(client, selector, { timeout, interval });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'roku_assert_element',
    'Assert that a SceneGraph element exists, is focused, or has a specific attribute value.',
    {
      selector: z.string().describe('CSS-like selector to match'),
      assertion: z.enum(['exists', 'focused', 'attribute']).optional(),
      attribute_name: z.string().optional(),
      attribute_value: z.string().optional(),
    },
    async ({ selector, assertion, attribute_name, attribute_value }) => {
      const result = await assertElement(client, selector, assertion, attribute_name, attribute_value);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'roku_sideload_and_watch',
    'Deploy a .zip package, then monitor the BrightScript console for errors, crashes, and exceptions.',
    {
      zip_path: z.string().describe('Path to the .zip package to sideload'),
      duration: z.number().optional().describe('How long to watch in ms (default: 30000)'),
      channel_id: z.string().optional().describe('Channel to launch after sideload (default: "dev")'),
    },
    async ({ zip_path, duration, channel_id }) => {
      const result = await sideloadAndWatch(client, zip_path, { duration, channelId: channel_id });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'roku_smoke_test',
    'Launch the app, verify the UI loads, and optionally verify playback starts. Returns structured pass/fail JSON.',
    {
      channel_id: z.string().optional(),
      content_id: z.string().optional(),
      media_type: z.string().optional(),
      ui_timeout: z.number().optional(),
      playback_timeout: z.number().optional(),
    },
    async ({ channel_id, content_id, media_type, ui_timeout, playback_timeout }) => {
      const result = await smokeTest(client, {
        channelId: channel_id, contentId: content_id, mediaType: media_type,
        uiTimeout: ui_timeout, playbackTimeout: playback_timeout,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Priority 2 — Agent efficiency
  server.tool(
    'roku_focused_element',
    'Return the currently focused SceneGraph element without scanning the whole tree.',
    { _: z.string().optional().describe('unused') },
    async () => {
      const text = await focusedElement(client);
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'roku_screen_name',
    'Infer what screen the app is on from the SceneGraph root component name.',
    { _: z.string().optional().describe('unused') },
    async () => {
      const text = await screenName(client);
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'roku_console_watch',
    'Monitor the BrightScript console for a pattern. Returns pass/fail plus matching lines.',
    {
      pattern: z.string().describe('String to watch for (case-insensitive)'),
      duration: z.number().optional().describe('How long to monitor in ms (default: 5000)'),
      expect_match: z.boolean().optional(),
    },
    async ({ pattern, duration, expect_match }) => {
      const result = await consoleWatch(client, pattern, { duration, expectMatch: expect_match });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Priority 3 — Shift Left quality gates
  server.tool(
    'roku_cert_preflight',
    'Run a checklist of known Roku certification failure patterns against the live app.',
    { channel_id: z.string().optional().describe('Dev channel ID (default: "dev")') },
    async ({ channel_id }) => {
      const result = await certPreflight(client, channel_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'roku_chanperf_sample',
    'Poll chanperf for CPU/memory metrics over a duration. Returns high watermark, average, and pass/fail verdict.',
    {
      duration: z.number().optional().describe('Sampling duration in ms (default: 10000)'),
      interval: z.number().optional().describe('Poll interval in ms (default: 1000)'),
      cpu_threshold: z.number().optional().describe('Max acceptable average CPU % (default: 80)'),
    },
    async ({ duration, interval, cpu_threshold }) => {
      const result = await chanperfSample(client, { duration, interval, cpuThreshold: cpu_threshold });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
