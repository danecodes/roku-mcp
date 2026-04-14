import { describe, it, expect, beforeAll } from 'vitest';
import {
  createClient,
  TEST_APP_ZIP,
  navigateToScreen,
  sleep,
  waitFor,
  assertElement,
  Key,
  getUiTree,
  findElement,
} from './helpers.js';
import type { EcpClient } from '@danecodes/roku-ecp';

describe('Navigation', () => {
  let client: EcpClient;

  beforeAll(async () => {
    client = createClient();
    await client.sideload(TEST_APP_ZIP);
    await sleep(3000);
    await waitFor(client, 'HomeScreen', { timeout: 10_000 });
  });

  it('shows home screen with welcome message after sideload', async () => {
    const result = await assertElement(
      client, '#welcomeLabel', 'attribute', 'text', 'Welcome to roku-mcp test app',
    );
    expect(result.passed).toBe(true);
  });

  it('opens nav menu on Left press', async () => {
    await client.press(Key.Left);
    await sleep(1000);

    const result = await assertElement(client, 'NavMenu', 'exists');
    expect(result.passed).toBe(true);

    // Close menu
    await client.press(Key.Right);
    await sleep(500);
  });

  it('navigates to Search screen', async () => {
    await navigateToScreen(client, 'search');
    const result = await waitFor(client, 'SearchScreen', { timeout: 5000 });
    expect(result.passed).toBe(true);
  });

  it('navigates to Settings screen', async () => {
    await navigateToScreen(client, 'settings');
    const result = await waitFor(client, 'SettingsScreen', { timeout: 5000 });
    expect(result.passed).toBe(true);
  });

  it('navigates to About screen', async () => {
    await navigateToScreen(client, 'about');
    const result = await assertElement(
      client, '#versionLabel', 'attribute', 'text', 'roku-mcp test app v1.0.0',
    );
    expect(result.passed).toBe(true);
  });

  it('navigates back to Home', async () => {
    await navigateToScreen(client, 'home');
    const result = await waitFor(client, '#welcomeLabel', { timeout: 5000 });
    expect(result.passed).toBe(true);
  });
});
