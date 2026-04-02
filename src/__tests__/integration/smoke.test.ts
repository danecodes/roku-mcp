import { describe, it, expect, beforeAll } from 'vitest';
import {
  createClient,
  TEST_APP_ZIP,
  sleep,
  getUiTree,
  findElement,
  findFocused,
  parseUiXml,
  waitFor,
  assertElement,
} from './helpers.js';
import {
  smokeTest,
  sideloadAndWatch,
  focusedElement,
  screenName,
  consoleWatch,
  certPreflight,
  chanperfSample,
} from '../../core/tool-handlers.js';
import type { EcpClient } from '../../core/ecp-client.js';

describe('All Tools Validation', () => {
  let client: EcpClient;

  beforeAll(async () => {
    client = createClient();
  });

  // ---- Tool 1: roku_sideload_and_watch ----
  it('roku_sideload_and_watch — sideloads and monitors console', async () => {
    const result = await sideloadAndWatch(client, TEST_APP_ZIP, { duration: 5000 });
    expect(result.passed).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.crashes).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  // ---- Tool 2: roku_device_info ----
  it('roku_device_info — returns device metadata', async () => {
    const info = await client.queryDeviceInfo();
    expect(info.modelName).toBeTruthy();
    expect(info.softwareVersion).toBeTruthy();
    expect(info.serialNumber).toBeTruthy();
  });

  // ---- Tool 3: roku_active_app ----
  it('roku_active_app — returns running app', async () => {
    const app = await client.queryActiveApp();
    expect(app.id).toBe('dev');
    expect(app.name).toBe('roku-mcp-test');
  });

  // ---- Tool 4: roku_installed_apps ----
  it('roku_installed_apps — lists channels', async () => {
    const apps = await client.queryInstalledApps();
    expect(apps.length).toBeGreaterThan(0);
    const dev = apps.find((a) => a.id === 'dev');
    expect(dev).toBeDefined();
    expect(dev!.name).toBe('roku-mcp-test');
  });

  // ---- Tool 5: roku_media_player ----
  it('roku_media_player — returns player state', async () => {
    const state = await client.queryMediaPlayer();
    expect(state).toHaveProperty('state');
    expect(state).toHaveProperty('error');
  });

  // ---- Tool 6: roku_screenshot ----
  it('roku_screenshot — captures PNG image', async () => {
    const buf = await client.takeScreenshot();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
  });

  // ---- Tool 7: roku_ui_tree ----
  it('roku_ui_tree — returns full SceneGraph tree', async () => {
    const tree = await getUiTree(client);
    expect(tree.tag).toBe('MainScene');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  // ---- Tool 8: roku_screen_name ----
  it('roku_screen_name — returns root component name', async () => {
    const name = await screenName(client);
    expect(name).toBe('MainScene');
  });

  // ---- Tool 9: roku_focused_element ----
  it('roku_focused_element — returns focused node info', async () => {
    const text = await focusedElement(client);
    expect(text).toContain('MainScene');
    expect(text).toContain('focused');
  });

  // ---- Tool 10: roku_find_element ----
  it('roku_find_element — finds elements by selector', async () => {
    const tree = await getUiTree(client);
    const label = findElement(tree, '#welcomeLabel');
    expect(label).toBeDefined();
    expect(label!.attrs.text).toBe('Welcome to roku-mcp test app');
  });

  // ---- Tool 11: roku_wait_for ----
  it('roku_wait_for — polls until element appears', async () => {
    const result = await waitFor(client, 'HomeScreen', { timeout: 5000 });
    expect(result.passed).toBe(true);
    expect(result.elapsed_ms).toBeLessThan(5000);
  });

  // ---- Tool 12: roku_assert_element ----
  it('roku_assert_element — asserts element attribute', async () => {
    const result = await assertElement(
      client, '#welcomeLabel', 'attribute', 'text', 'Welcome to roku-mcp test app',
    );
    expect(result.passed).toBe(true);
  });

  // ---- Tool 13: roku_press_key ----
  it('roku_press_key — sends remote key press', async () => {
    // Press Left to open nav menu
    await client.press('Left');
    await sleep(800);

    const tree = await getUiTree(client);
    const nav = findElement(tree, 'NavMenu');
    expect(nav).toBeDefined();

    // Close it
    await client.press('Right');
    await sleep(500);
  });

  // ---- Tool 14: roku_type_text ----
  it('roku_type_text — types text into input field', async () => {
    // Navigate to search
    await client.press('Left');
    await sleep(600);
    await client.press('Down');
    await sleep(200);
    await client.press('Select');
    await sleep(800);

    await client.type('test123', { delay: 100 });
    await sleep(800);

    const result = await assertElement(
      client, '#searchResult', 'attribute', 'text', 'You searched for: test123',
    );
    expect(result.passed).toBe(true);
  });

  // ---- Tool 15: roku_launch ----
  it('roku_launch — launches a channel', async () => {
    await client.launch('dev');
    await sleep(3000);
    const app = await client.queryActiveApp();
    expect(app.id).toBe('dev');
  });

  // ---- Tool 16: roku_deep_link ----
  it('roku_deep_link — deep links with contentId', async () => {
    await client.deepLink('dev', 'MOVIE42', 'movie');
    await sleep(3000);

    const result = await assertElement(
      client, '#contentIdLabel', 'attribute', 'text', 'contentId: MOVIE42',
    );
    expect(result.passed).toBe(true);
  });

  // ---- Tool 17: roku_input ----
  it('roku_input — sends custom input params', async () => {
    // roku_input sends params via ECP /input — just verify no error
    await client.input({ testKey: 'testValue' });
    // If it didn't throw, the command was accepted
    expect(true).toBe(true);
  });

  // ---- Tool 18: roku_volume ----
  it('roku_volume — controls device volume', async () => {
    // Mute and unmute — verify no errors
    await client.volumeMute();
    await sleep(300);
    await client.volumeMute(); // unmute
    expect(true).toBe(true);
  });

  // ---- Tool 19: roku_close_app ----
  it('roku_close_app — exits to home screen', async () => {
    await client.closeApp();
    await sleep(1500);
    const app = await client.queryActiveApp();
    // Active app should be the Roku home screen, not dev
    expect(app.id).not.toBe('dev');
  });

  // ---- Tool 20: roku_sideload ----
  it('roku_sideload — installs a zip package', async () => {
    const result = await client.sideload(TEST_APP_ZIP);
    expect(result).toBeTruthy();
    // Launch after sideload (close_app left us on home screen)
    await client.launch('dev');
    await sleep(3000);
    const app = await client.queryActiveApp();
    expect(app.id).toBe('dev');
  });

  // ---- Tool 21: roku_console_log ----
  it('roku_console_log — reads debug console output', async () => {
    const output = await client.readConsole({ duration: 2000 });
    // Output is a string (may be empty if no recent activity)
    expect(typeof output).toBe('string');
  });

  // ---- Tool 22: roku_console_command ----
  it('roku_console_command — sends debug command', async () => {
    const output = await client.sendConsoleCommand('var', { duration: 2000 });
    // Returns a string response from the debugger
    expect(typeof output).toBe('string');
  });

  // ---- Tool 23: roku_console_watch ----
  it('roku_console_watch — monitors for pattern', async () => {
    const result = await consoleWatch(client, 'NONEXISTENT_PATTERN', {
      duration: 2000,
      expectMatch: false,
    });
    expect(result.passed).toBe(true);
    expect(result.matched).toBe(false);
  });

  // ---- Tool 24: roku_smoke_test ----
  it('roku_smoke_test — launch + UI render check', async () => {
    const result = await smokeTest(client, {
      channelId: 'dev',
      uiTimeout: 10_000,
    });
    expect(result.passed).toBe(true);
    expect(result.steps.find((s) => s.name === 'ui_visible')?.passed).toBe(true);
  });

  // ---- Tool 25: roku_cert_preflight ----
  it('roku_cert_preflight — runs cert failure checklist', async () => {
    const result = await certPreflight(client);
    expect(result.passed).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  // ---- Tool 26: roku_chanperf_sample ----
  it('roku_chanperf_sample — samples CPU metrics', async () => {
    // Relaunch so chanperf has something to sample
    await client.launch('dev');
    await sleep(2000);
    const result = await chanperfSample(client, {
      duration: 3000,
      interval: 1000,
      cpuThreshold: 90,
    });
    expect(result.passed).toBe(true);
    expect(result.sample_count).toBeGreaterThan(0);
    expect(result.cpu_average).toBeDefined();
  });
});
