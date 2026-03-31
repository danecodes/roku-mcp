#!/usr/bin/env node

import { Command } from 'commander';
import { EcpClient, Key } from '../core/ecp-client.js';
import {
  parseUiXml,
  findElements,
  formatTree,
  formatTreePlain,
} from '../core/ui-tree.js';

const program = new Command();

program
  .name('roku-dev')
  .description('CLI tools for AI agents and developers to interact with Roku devices')
  .version('0.1.0')
  .option('-d, --device <ip>', 'Roku device IP address', '192.168.0.30');

/* ------------------------------------------------------------------ */
/*  ui — inspect the SceneGraph tree                                  */
/* ------------------------------------------------------------------ */

const ui = program.command('ui').description('Inspect the SceneGraph UI tree');

ui.command('tree')
  .description('Dump the full SceneGraph UI tree')
  .option('--depth <n>', 'Max depth to display', parseInt)
  .option('--all-attrs', 'Show all attributes (not just key ones)')
  .option('--attrs <list>', 'Show only these attributes (comma-separated)')
  .option('--highlight <selector>', 'Highlight nodes matching selector')
  .option('--plain', 'No color output (for piping / agents)')
  .action(async (opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const xml = await client.queryAppUi();
    const tree = await parseUiXml(xml);

    const formatOpts = {
      maxDepth: opts.depth,
      allAttrs: opts.allAttrs,
      attrs: opts.attrs?.split(','),
      highlight: opts.highlight,
    };

    if (opts.plain) {
      console.log(formatTreePlain(tree, formatOpts));
    } else {
      console.log(formatTree(tree, formatOpts));
    }
  });

ui.command('find <selector>')
  .description('Find elements matching a CSS-like selector')
  .option('--all-attrs', 'Show all attributes')
  .option('--plain', 'No color output')
  .action(async (selector, opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const xml = await client.queryAppUi();
    const tree = await parseUiXml(xml);

    const results = findElements(tree, selector);

    if (results.length === 0) {
      console.log(`No elements found matching: ${selector}`);
      process.exit(1);
    }

    console.log(`Found ${results.length} element(s):\n`);
    for (const node of results) {
      const format = opts.plain ? formatTreePlain : formatTree;
      console.log(format(node, { maxDepth: 0, allAttrs: opts.allAttrs }));
    }
  });

ui.command('source')
  .description('Print raw XML from /query/app-ui')
  .action(async (_opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const xml = await client.queryAppUi();
    console.log(xml);
  });

ui.command('screenshot')
  .description('Take a screenshot and save as PNG')
  .option('-o, --output <path>', 'Output file path', 'roku_screenshot.png')
  .option('--password <password>', 'Dev mode password', 'rokudev')
  .action(async (opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp, 8060, { devPassword: opts.password });
    const buf = await client.takeScreenshot();
    const fs = await import('fs');
    fs.writeFileSync(opts.output, buf);
    console.log(`Screenshot saved to ${opts.output} (${buf.length} bytes)`);
  });

/* ------------------------------------------------------------------ */
/*  console — BrightScript debug console                              */
/* ------------------------------------------------------------------ */

const consoleCmd = program.command('console').description('BrightScript debug console (port 8085)');

consoleCmd
  .command('log')
  .description('Read recent console output')
  .option('--duration <ms>', 'How long to read in ms (default: 2000)')
  .option('--filter <text>', 'Only show lines containing this text')
  .action(async (opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const output = await client.readConsole({
      duration: opts.duration ? parseInt(opts.duration, 10) : 2000,
      filter: opts.filter,
    });
    console.log(output || '(no output)');
  });

consoleCmd
  .command('send <command>')
  .description('Send a debug command (bt, var, cont, step, over, out)')
  .option('--duration <ms>', 'How long to read response in ms (default: 2000)')
  .action(async (command, opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const output = await client.sendConsoleCommand(command, {
      duration: opts.duration ? parseInt(opts.duration, 10) : 2000,
    });
    console.log(output || '(no response)');
  });

/* ------------------------------------------------------------------ */
/*  press — send key presses                                          */
/* ------------------------------------------------------------------ */

program
  .command('press <key>')
  .description(
    `Send a key press (${Object.keys(Key).join(', ')})`
  )
  .option('-n, --times <n>', 'Number of times to press', parseInt, 1)
  .option('--delay <ms>', 'Delay between presses in ms', parseInt, 100)
  .action(async (key, opts, cmd) => {
    const deviceIp = cmd.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    await client.press(key, { times: opts.times, delay: opts.delay });
    console.log(`Pressed ${key}${opts.times > 1 ? ` x${opts.times}` : ''}`);
  });

/* ------------------------------------------------------------------ */
/*  type — send text input                                            */
/* ------------------------------------------------------------------ */

program
  .command('type <text>')
  .description('Type text into a keyboard input')
  .option('--delay <ms>', 'Delay between characters in ms', parseInt, 50)
  .action(async (text, opts, cmd) => {
    const deviceIp = cmd.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    await client.type(text, { delay: opts.delay });
    console.log(`Typed: ${text}`);
  });

/* ------------------------------------------------------------------ */
/*  launch — launch an app                                            */
/* ------------------------------------------------------------------ */

program
  .command('launch [channelId]')
  .description('Launch an app (default: dev)')
  .option('-p, --params <json>', 'Launch params as JSON')
  .action(async (channelId = 'dev', opts, cmd) => {
    const deviceIp = cmd.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const params = opts.params ? JSON.parse(opts.params) : undefined;
    await client.launch(channelId, params);
    console.log(`Launched ${channelId}`);
  });

/* ------------------------------------------------------------------ */
/*  info — device and app info                                        */
/* ------------------------------------------------------------------ */

const info = program.command('info').description('Query device and app info');

info
  .command('device')
  .description('Show device info')
  .action(async (_opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const info = await client.queryDeviceInfo();
    console.log(info);
  });

info
  .command('app')
  .description('Show currently active app')
  .action(async (_opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const app = await client.queryActiveApp();
    console.log(app);
  });

info
  .command('apps')
  .description('List installed apps')
  .action(async (_opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const apps = await client.queryInstalledApps();
    for (const app of apps) {
      console.log(`${app.id.padEnd(8)} ${app.name} (v${app.version})`);
    }
  });

info
  .command('player')
  .description('Show media player state')
  .action(async (_opts, cmd) => {
    const deviceIp = cmd.parent!.parent!.opts().device;
    const client = new EcpClient(deviceIp);
    const state = await client.queryMediaPlayer();
    console.log(state);
  });

/* ------------------------------------------------------------------ */
/*  Run                                                               */
/* ------------------------------------------------------------------ */

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
